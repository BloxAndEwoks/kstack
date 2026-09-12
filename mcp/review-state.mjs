#!/usr/bin/env node
// kstack review-state — a zero-dependency MCP server (stdio, JSON-RPC 2.0).
//
// Gives any agent host the two capabilities Devin's session harness provides
// natively: (1) the session's ground-truth context (repo, branch, BASE, PR),
// and (2) a normalized findings store — the listComments/addComment/
// resolveComments equivalent, persisted per branch/PR under .kstack/review/.
//
// Usage:
//   MCP stdio server:  node review-state.mjs
//   Print context:     node review-state.mjs --print-context
//
// The store lives in the *consuming* repo at .kstack/review/<key>.json, where
// <key> is the PR number or the sanitized branch name.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, statSync, rmdirSync } from "node:fs";
import { join } from "node:path";

const PROTOCOL_VERSION = "2024-11-05";

// ---------- repo resolution ----------
// Plugin MCP servers spawn with cwd = PLUGIN ROOT, not the consuming repo.
// Never trust process.cwd(): every tool accepts an optional `path` (the agent's
// workspace — agents know their own cwd), then host env vars, then cwd.

function resolveCwd(path) {
  return path
    ?? process.env.DEVIN_PROJECT_DIR
    ?? process.env.CLAUDE_PROJECT_DIR
    ?? process.env.CODEX_PROJECT_ROOT
    ?? process.env.INIT_CWD
    ?? process.cwd();
}

// ---------- git helpers ----------

function git(args, cwd = resolveCwd()) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function gh(args, cwd = resolveCwd()) {
  try {
    return execFileSync("gh", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function sessionContext(path) {
  const root = git(["rev-parse", "--show-toplevel"], resolveCwd(path));
  if (!root) return { error: "not inside a git repository" };
  const branch = git(["branch", "--show-current"], root);
  const head = git(["rev-parse", "HEAD"], root);
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root);
  const defaultRef = git(["symbolic-ref", "refs/remotes/origin/HEAD"], root) || "refs/remotes/origin/main";
  const defaultBranch = defaultRef.replace("refs/remotes/origin/", "");
  const base = git(["merge-base", "HEAD", `origin/${defaultBranch}`], root);
  const dirty = git(["status", "--porcelain"], root);
  const aheadBehind = upstream ? git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`], root) : null;
  let pr = null;
  const prJson = gh(["pr", "view", "--json", "number,baseRefName,state"], root);
  if (prJson) { try { pr = JSON.parse(prJson); } catch { /* no PR */ } }
  return {
    repo_root: root,
    branch,
    head_sha: head,
    base_branch: defaultBranch,
    base_sha: base,
    upstream,
    ahead_behind: aheadBehind,
    dirty: dirty ? dirty.split("\n") : [],
    pr,
  };
}

// ---------- findings store ----------

function storePath(key, path) {
  const root = git(["rev-parse", "--show-toplevel"], resolveCwd(path));
  if (!root) throw new Error("not inside a git repository");
  const safe = String(key).replace(/[^a-zA-Z0-9._-]/g, "-");
  const dir = join(root, ".kstack", "review");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${safe}.json`);
}

function loadStore(key, path) {
  const p = storePath(key, path);
  if (!existsSync(p)) return { key, findings: [] };
  return JSON.parse(readFileSync(p, "utf8"));
}

function ensureExcluded(path) {
  // Local-only state (live review working sets, locks) is excluded per-checkout
  // via .git/info/exclude — the ledger, archive, and verify contract are
  // committed records and stay visible to git.
  try {
    const cwd = resolveCwd(path);
    const gitDir = git(["rev-parse", "--git-dir"], cwd);
    if (gitDir) {
      const root = git(["rev-parse", "--show-toplevel"], cwd);
      const excludePath = join(root, gitDir, "info", "exclude");
      const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
      if (!existing.split("\n").some(l => l.trim() === ".kstack/review/")) {
        writeFileSync(excludePath, existing.replace(/\n?$/, "\n") + ".kstack/review/\n");
      }
    }
  } catch { /* non-fatal: store still works, just not auto-excluded */ }
}

function repoRoot(path) {
  const root = git(["rev-parse", "--show-toplevel"], resolveCwd(path));
  if (!root) throw new Error("not inside a git repository");
  return root;
}

// ---------- committed ledger ----------
// The durable cross-unit record: one JSONL line per landed unit plus a full
// findings snapshot per PR. Written at land, committed to the repo — the
// index over what would otherwise be buried in closed PRs.

function ledgerAppend(key, pr, opts, path) {
  const root = repoRoot(path);
  const dir = join(root, ".kstack");
  const archiveDir = join(dir, "archive");
  mkdirSync(archiveDir, { recursive: true });

  const store = loadStore(key ?? String(pr), path);
  const sha = git(["rev-parse", "HEAD"], root);
  const branch = git(["branch", "--show-current"], root);

  const byKind = {}, byMech = {}, byDisp = {};
  for (const f of store.findings) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    if (f.mechanism) byMech[f.mechanism] = (byMech[f.mechanism] ?? 0) + 1;
    byDisp[f.disposition] = (byDisp[f.disposition] ?? 0) + 1;
  }
  const pending = store.findings.filter(f => f.disposition === "pending").length;

  const row = {
    pr: pr ?? null,
    key: store.key,
    branch: branch ?? null,
    sha,
    findings: store.findings.length,
    by_kind: byKind,
    by_mechanism: byMech,
    by_disposition: byDisp,
    pending_at_land: pending,
    verdict: opts?.verdict ?? reviewState(store.key, path).suggested_verdict,
    surfaces_verified: opts?.surfaces_verified ?? [],
    notes: opts?.notes ?? null,
    landed_at: new Date().toISOString(),
  };

  // append-only: one line per unit; a re-append for the same key is a new row
  const line = JSON.stringify(row) + "\n";
  const ledgerPath = join(dir, "ledger.jsonl");
  writeFileSync(ledgerPath, (existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "") + line);

  const archivePath = join(archiveDir, `${store.key.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`);
  writeFileSync(archivePath, JSON.stringify(store, null, 2) + "\n");

  return { ledger: ".kstack/ledger.jsonl", archive: `.kstack/archive/${store.key}.json`, row };
}

// Serialize read-modify-write on a store file. mkdirSync is atomic create —
// exactly one process holds the lock; everyone else retries briefly. Stale
// locks (>30s, i.e. a crashed holder) are broken. Same-PR writes from two
// sessions or a racing --watch hook can no longer lose findings.
function mutateStore(key, path, fn) {
  const p = storePath(key, path);
  const lockDir = `${p}.lock`;
  const deadline = Date.now() + 5000;
  for (;;) {
    try { mkdirSync(lockDir); break; }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > 30_000) { rmdirSync(lockDir); continue; }
      } catch { continue; } // lock vanished between checks — retry
      if (Date.now() > deadline) throw new Error(`timed out acquiring store lock for ${key}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    const store = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { key, findings: [] };
    const result = fn(store);
    const tmp = `${p}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n");
    renameSync(tmp, p); // atomic: a crash leaves the previous store intact
    ensureExcluded(path);
    return result;
  } finally {
    try { rmdirSync(lockDir); } catch { /* already gone */ }
  }
}

const KINDS = ["bug", "security", "flag"];
const SEVERITIES = {
  bug: ["severe", "non-severe"],
  security: ["critical", "high", "medium", "low"],
  flag: ["investigate", "note"],
};
const MECHANISMS = ["wrong-model", "missing-fact", "missing-guard"];
const DISPOSITIONS = ["pending", "fixed", "refuted", "deferred", "accepted-risk", "dismissed"];

function validateFinding(f) {
  const errors = [];
  if (!KINDS.includes(f.kind)) errors.push(`kind must be one of ${KINDS.join(", ")}`);
  if (f.kind && f.severity && !SEVERITIES[f.kind]?.includes(f.severity))
    errors.push(`severity "${f.severity}" invalid for kind "${f.kind}"`);
  if (!f.path) errors.push("path required");
  if (!f.title) errors.push("title required");
  if (f.mechanism && !MECHANISMS.includes(f.mechanism))
    errors.push(`mechanism must be one of ${MECHANISMS.join(", ")}`);
  return errors;
}

function addFinding(key, f, path) {
  const errors = validateFinding(f);
  if (errors.length) throw new Error(errors.join("; "));
  return mutateStore(key, path, (store) => {
    const seq = String(store.findings.length + 1).padStart(4, "0");
    const prefix = { bug: "BUG", security: "SEC", flag: "FLG" }[f.kind];
    const finding = {
      id: f.id ?? `${prefix}_${key}_${seq}`,
      source: f.source ?? "self-review",
      kind: f.kind,
      severity: f.severity,
      confidence: f.confidence ?? "medium",
      cwe: f.cwe ?? null,
      category: f.category ?? null,
      based_on_repo_rules: f.based_on_repo_rules ?? false,
      path: f.path,
      start_line: f.start_line ?? null,
      end_line: f.end_line ?? null,
      side: f.side ?? "RIGHT",
      title: f.title,
      body: f.body ?? "",
      remediation: f.remediation ?? null,
      mechanism: f.mechanism ?? null,
      thread_id: f.thread_id ?? null,
      disposition: "pending",
      disposition_detail: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
    };
    store.findings.push(finding);
    return finding;
  });
}

function disposeFinding(key, id, disposition, detail, path) {
  if (!DISPOSITIONS.includes(disposition) || disposition === "pending")
    throw new Error(`disposition must be a terminal one of: ${DISPOSITIONS.filter(d => d !== "pending").join(", ")}`);
  return mutateStore(key, path, (store) => {
    const finding = store.findings.find(x => x.id === id);
    if (!finding) throw new Error(`no finding with id ${id}`);
    finding.disposition = disposition;
    finding.disposition_detail = detail ?? null;
    finding.resolved_at = new Date().toISOString();
    return finding;
  });
}

function reviewState(key, path) {
  const store = loadStore(key, path);
  const by = (fn) => store.findings.reduce((m, f) => { const k = fn(f); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const pending = store.findings.filter(f => f.disposition === "pending");
  const openSevere = pending.filter(f =>
    (f.kind === "bug" && f.severity === "severe") ||
    (f.kind === "security" && ["critical", "high"].includes(f.severity)));
  return {
    key,
    total: store.findings.length,
    pending: pending.length,
    by_kind: by(f => f.kind),
    by_disposition: by(f => f.disposition),
    open_blocking: openSevere.map(f => f.id),
    suggested_verdict: pending.length === 0 ? "PASS"
      : openSevere.length > 0 ? "FAIL" : "PASS+NOTES",
  };
}

// ---------- PR comment channel + normalization (the adapters, in code) ----------
//
// These four tools are the addComment/listComments/resolveComments/
// deleteComments equivalent, provisioned over `gh`. comments_pull both fetches
// and normalizes — the adapter rules run here as code, not as instructed prose.

function repoSlug(path) {
  const url = git(["remote", "get-url", "origin"], resolveCwd(path)) ?? "";
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error("cannot determine owner/repo from origin remote");
  return m[1];
}

function currentPrNumber(path) {
  const out = gh(["pr", "view", "--json", "number"], resolveCwd(path));
  if (!out) return null;
  try { return JSON.parse(out).number; } catch { return null; }
}

const EMOJI_SEV = {
  "🔴": { kind: "bug", severity: "severe" },
  "🟡": { kind: "bug", severity: "non-severe" },
  "🟥": { kind: "security", severity: "high" },
  "🟨": { kind: "security", severity: "medium" },
  "🔵": { kind: "flag", severity: "note" },
};

const CODERABBIT_SEV = [
  [/potential issue/i, { kind: "bug", severity: "non-severe" }],
  [/refactor suggestion/i, { kind: "flag", severity: "investigate" }],
  [/nitpick|💡|🧹/i, { kind: "flag", severity: "note" }],
];

function normalizeComment(c, source) {
  // Devin Review / kstack markers
  const marker = c.body?.match(/<!--\s*(devin-review-comment|kstack-finding)\s+(\{[^}]*\})\s*-->/);
  let meta = {};
  if (marker) { try { meta = JSON.parse(marker[2]); } catch { meta = {}; } }
  // marker beats login for source attribution — a devin-review marker means the
  // tool spoke, whoever posted it
  if (marker?.[1] === "devin-review-comment") source = "devin-review";
  else if (marker?.[1] === "kstack-finding") source = "self-review";
  else if (/coderabbit/i.test(c.user?.login ?? "")) source = "coderabbit";

  const head = (c.body ?? "").replace(/<!--[\s\S]*?-->/, "").trim();
  const emoji = Object.keys(EMOJI_SEV).find(e => head.startsWith(e));
  const titleM = head.match(/\*\*([^*]+)\*\*/);

  let kind = meta.kind, severity = null, confidence = "medium";
  if (emoji) ({ kind, severity } = { kind: meta.kind ?? EMOJI_SEV[emoji].kind, severity: EMOJI_SEV[emoji].severity });
  if (!severity) {
    const cr = CODERABBIT_SEV.find(([re]) => re.test(c.body ?? ""));
    if (cr) { kind = kind ?? cr[1].kind; severity = cr[1].severity; }
  }
  if (source === "human") { kind = kind ?? "flag"; severity = severity ?? "investigate"; }
  kind = kind ?? "bug";
  severity = severity ?? (kind === "bug" ? "non-severe" : kind === "security" ? "medium" : "investigate");

  const cweM = (c.body ?? "").match(/CWE-\d+/);
  return {
    id: meta.id ?? `${source === "human" ? "HUMAN" : "RAW"}_${c.id}`,
    source,
    kind, severity, confidence,
    cwe: cweM ? cweM[0] : null,
    category: null,
    based_on_repo_rules: meta.based_on_repo_rules ?? false,
    path: meta.file_path ?? c.path ?? "(pr-level)",
    start_line: meta.start_line ?? c.start_line ?? c.line ?? null,
    end_line: meta.end_line ?? c.line ?? null,
    side: meta.side ?? c.side ?? "RIGHT",
    title: titleM ? titleM[1].trim() : head.split("\n")[0].slice(0, 120),
    body: head,
    remediation: null,
    thread_id: String(c.id),
    in_reply_to: c.in_reply_to_id ?? null,
    author: c.user?.login ?? "unknown",
    disposition: "pending",
    disposition_detail: null,
    mechanism: null,
    created_at: c.created_at ?? new Date().toISOString(),
    resolved_at: null,
  };
}

function commentsPull(key, pr, path) {
  const slug = repoSlug(path);
  const n = pr ?? currentPrNumber(path);
  if (!n) throw new Error("no PR for the current branch; pass pr explicitly");
  const cwd = resolveCwd(path);
  const inline = JSON.parse(gh(["api", `repos/${slug}/pulls/${n}/comments`, "--paginate"], cwd) ?? "[]");
  const topLevel = JSON.parse(gh(["api", `repos/${slug}/issues/${n}/comments`, "--paginate"], cwd) ?? "[]");

  const humanish = (login) => !/\[bot\]$/i.test(login) && !/^coderabbit/i.test(login ?? "") ? "human" : login;
  const all = [...inline, ...topLevel];

  return mutateStore(key ?? String(n), path, (store) => {
    const byId = new Map(store.findings.map(f => [f.id, f]));
    let added = 0, updated = 0;

    for (const c of all) {
      const body = c.body ?? "";
      // resolution replies: "✅ **Resolved**:" from a review bot disposes the parent
      const replyTo = c.in_reply_to_id;
      if (replyTo && /✅\s*\*\*Resolved\*\*/.test(body)) {
        const parent = [...byId.values()].find(f => f.thread_id === String(replyTo));
        if (parent && parent.disposition === "pending") {
          parent.disposition = "fixed";
          parent.disposition_detail = body.replace(/✅\s*\*\*Resolved\*\*:?\s*/, "").slice(0, 300);
          parent.resolved_at = new Date().toISOString();
          updated++;
        }
        continue;
      }
      const f = normalizeComment(c, humanish(c.user?.login));
      const existing = byId.get(f.id);
      if (!existing) {
        store.findings.push(f); byId.set(f.id, f); added++;
      } else {
        // re-review: same id reappears — refresh body/anchor, keep disposition
        Object.assign(existing, { body: f.body, title: f.title, start_line: f.start_line, end_line: f.end_line });
        updated++;
      }
    }
    return { pr: n, total: store.findings.length, added, updated, pending: store.findings.filter(f => f.disposition === "pending").length };
  });
}

function commentAdd(pr, f, path) {
  const slug = repoSlug(path);
  const n = pr ?? currentPrNumber(path);
  if (!n) throw new Error("no PR for the current branch; pass pr explicitly");
  const cwd = resolveCwd(path);
  const headSha = gh(["pr", "view", String(n), "--json", "headRefOid", "--jq", ".headRefOid"], cwd);
  const marker = { id: f.id, kind: f.kind, severity: f.severity, confidence: f.confidence ?? "medium", based_on_repo_rules: f.based_on_repo_rules ?? false, file_path: f.path, start_line: f.start_line, end_line: f.end_line ?? f.start_line, side: f.side ?? "RIGHT" };
  const emoji = { bug: { severe: "🔴", "non-severe": "🟡" }, security: { critical: "🟥", high: "🟥", medium: "🟨", low: "🔵" }, flag: { investigate: "🔵", note: "🔵" } }[f.kind]?.[f.severity] ?? "🔵";
  const body = `<!-- kstack-finding ${JSON.stringify(marker)} -->\n\n${emoji} **${f.title}**\n\n${f.body ?? ""}${f.remediation ? `\n\nSuggested fix: ${f.remediation}` : ""}`;
  const payload = { body, commit_id: headSha, path: f.path, side: f.side ?? "RIGHT" };
  if (f.start_line && f.end_line && f.end_line !== f.start_line) {
    payload.start_line = f.start_line; payload.line = f.end_line;
    if (f.side) payload.start_side = f.side;
  } else {
    payload.line = f.end_line ?? f.start_line;
  }
  const tmp = `${process.env.TMPDIR ?? "/tmp"}kstack-comment-${Date.now()}.json`;
  writeFileSync(tmp, JSON.stringify(payload));
  const out = gh(["api", `repos/${slug}/pulls/${n}/comments`, "-X", "POST", "--input", tmp], cwd);
  if (!out) throw new Error("gh api failed posting the comment");
  const posted = JSON.parse(out);
  return { id: f.id, comment_id: posted.id, html_url: posted.html_url };
}

function commentReply(commentId, body, path) {
  const slug = repoSlug(path);
  const tmp = `${process.env.TMPDIR ?? "/tmp"}kstack-reply-${Date.now()}.json`;
  writeFileSync(tmp, JSON.stringify({ body }));
  const cwd = resolveCwd(path);
  const out = gh(["api", `repos/${slug}/pulls/comments/${commentId}/replies`, "-X", "POST", "--input", tmp], cwd);
  if (!out) throw new Error("gh api failed posting the reply");
  const posted = JSON.parse(out);
  return { comment_id: posted.id, html_url: posted.html_url };
}

function commentResolve(id, path) {
  // Accepts either a GraphQL thread id (PRRT_…) or a REST comment id —
  // stored thread_id values are REST comment ids, so look the thread up.
  let threadId = id;
  if (!String(id).startsWith("PRRT_")) {
    const slug = repoSlug(path);
    const [owner, repo] = slug.split("/");
    const n = currentPrNumber(path);
    const q = `query { repository(owner:"${owner}",name:"${repo}") { pullRequest(number:${n}) { reviewThreads(first:100) { nodes { id isResolved comments(first:100) { nodes { databaseId } } } } } } }`;
    const out = gh(["api", "graphql", "-f", `query=${q}`], resolveCwd(path));
    if (!out) throw new Error("graphql lookup of review threads failed");
    const threads = JSON.parse(out).data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
    const hit = threads.find(t => t.comments?.nodes?.some(c => String(c.databaseId) === String(id)));
    if (!hit) throw new Error(`no review thread contains comment ${id}`);
    if (hit.isResolved) return { thread_id: hit.id, isResolved: true, already: true };
    threadId = hit.id;
  }
  const out = gh(["api", "graphql", "-f", `query=mutation { resolveReviewThread(input:{threadId:"${threadId}"}) { thread { isResolved } } }`], resolveCwd(path));
  if (!out) throw new Error("gh api graphql failed");
  return JSON.parse(out);
}

// Pure diff, extracted for testing: given the last-seen snapshot and the
// current observation, return what's new. First run baselines (no alerts).
function diffWatch(seen, commentIds, failingChecks) {
  const newCommentIds = seen.at ? commentIds.filter(id => !seen.comment_ids.includes(id)) : [];
  const newlyFailing = failingChecks.filter(x => !seen.failing_checks.includes(x));
  return { newCommentIds, newlyFailing, quiet: newCommentIds.length === 0 && newlyFailing.length === 0 };
}

const FAILING_CHECK_STATES = ["FAILURE", "ERROR", "TIMED_OUT"]; // CANCELLED is infra, not a verdict

function watch(key, path) {
  // The standing-monitor equivalent for active sessions: diff remote PR state
  // against the last-seen snapshot stored alongside the findings.
  const slug = repoSlug(path);
  const n = currentPrNumber(path);
  if (!n) return { state: "no-pr", message: "no PR for the current branch — nothing to watch" };

  const prJson = gh(["pr", "view", String(n), "--json", "number,state,headRefOid"], resolveCwd(path));
  const pr = prJson ? JSON.parse(prJson) : null;
  if (!pr) return { state: "no-pr", message: "no PR for the current branch" };
  if (pr.state === "MERGED" || pr.state === "CLOSED") {
    return { state: pr.state.toLowerCase(), pr: n, quiet: true, new_comments: [], newly_failing_checks: [], pending_findings: loadStore(key ?? String(n), path).findings.filter(f => f.disposition === "pending").length };
  }

  const cwd = resolveCwd(path);
  const inline = JSON.parse(gh(["api", `repos/${slug}/pulls/${n}/comments`, "--paginate"], cwd) ?? "[]");
  const topLevel = JSON.parse(gh(["api", `repos/${slug}/issues/${n}/comments`, "--paginate"], cwd) ?? "[]");
  const currentIds = [...inline, ...topLevel].map(c => c.id);

  const checks = JSON.parse(gh(["pr", "checks", String(n), "--json", "name,state"], cwd) ?? "[]");
  const failingNow = checks.filter(c => FAILING_CHECK_STATES.includes(c.state)).map(c => c.name);

  return mutateStore(key ?? String(n), path, (store) => {
    const seen = store.watch ?? { comment_ids: [], failing_checks: [], at: null };
    const { newCommentIds, newlyFailing, quiet } = diffWatch(seen, currentIds, failingNow);

    const newComments = [...inline, ...topLevel]
      .filter(c => newCommentIds.includes(c.id))
      .map(c => ({ id: c.id, author: c.user?.login, path: c.path ?? null, preview: (c.body ?? "").replace(/<!--[\s\S]*?-->/, "").trim().slice(0, 140) }));

    store.watch = { comment_ids: currentIds, failing_checks: failingNow, at: new Date().toISOString() };

    return {
      pr: n,
      checked_at: store.watch.at,
      new_comments: newComments,
      newly_failing_checks: newlyFailing,
      pending_findings: store.findings.filter(f => f.disposition === "pending").length,
      first_run: seen.at === null,
      quiet,
    };
  });
}

function doctor(path) {
  const cwd = resolveCwd(path);
  const checks = {
    node: process.version,
    git: git(["--version"], cwd),
    gh_cli: gh(["--version"], cwd)?.split("\n")[0] ?? null,
    gh_auth: null,
    repo: git(["rev-parse", "--show-toplevel"], cwd),
    gh_pr_view: null,
  };
  const auth = gh(["auth", "status"], cwd);
  checks.gh_auth = auth ? "ok" : (() => { try { execFileSync("gh", ["auth", "status"], { cwd, stdio: ["ignore", "pipe", "pipe"] }); return "ok"; } catch { return "missing"; } })();
  checks.gh_pr_view = checks.repo && checks.gh_auth === "ok" ? "ok" : "unverified";
  const missing = Object.entries(checks).filter(([k, v]) => v === null || v === "missing").map(([k]) => k);
  return { ok: missing.length === 0, checks, missing, guidance: missing.length ? "install/authenticate the missing pieces; gh CLI is required for PR I/O (brew install gh && gh auth login)" : "fully wired" };
}

// ---------- MCP tool surface ----------

const TOOLS = [
  {
    name: "session_context",
    description: "The unit's ground truth: repo root, branch, HEAD, base branch and BASE sha, upstream/ahead-behind, dirty files, and the PR (number/base/state) when one exists.",
    inputSchema: { type: "object", properties: { repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" } }, additionalProperties: false },
  },
  {
    name: "finding_add",
    description: "Add a normalized review finding to the store. Keyed by PR number or branch name. Schema per skills/review-loop/references/finding-schema.md.",
    inputSchema: {
      type: "object",
      required: ["key", "kind", "severity", "path", "title"],
      properties: {
        key: { type: "string", description: "PR number or branch name" },
        repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" },
        kind: { type: "string", enum: KINDS },
        severity: { type: "string", description: "bug: severe|non-severe; security: critical|high|medium|low; flag: investigate|note" },
        source: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] },
        cwe: { type: "string" }, category: { type: "string" },
        mechanism: { type: "string", enum: MECHANISMS, description: "wrong-model (redesign) | missing-fact (carry the fact upstream) | missing-guard (local fix correct)" },
        based_on_repo_rules: { type: "boolean" },
        path: { type: "string" }, start_line: { type: "number" }, end_line: { type: "number" },
        side: { type: "string", enum: ["RIGHT", "LEFT"] },
        title: { type: "string" }, body: { type: "string" }, remediation: { type: "string" },
        thread_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "finding_list",
    description: "List findings for a key, optionally filtered by disposition, kind, or severity.",
    inputSchema: {
      type: "object", required: ["key"],
      properties: {
        key: { type: "string" },
        repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" },
        disposition: { type: "string", enum: DISPOSITIONS },
        kind: { type: "string", enum: KINDS },
        severity: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "finding_dispose",
    description: "Set a finding's terminal disposition: fixed (detail=SHA) | refuted (detail=evidence) | deferred (detail=named trigger) | accepted-risk (detail=reason) | dismissed (detail=what supersedes).",
    inputSchema: {
      type: "object", required: ["key", "id", "disposition"],
      properties: {
        key: { type: "string" },
        repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" },
        id: { type: "string" },
        disposition: { type: "string", enum: DISPOSITIONS.filter(d => d !== "pending") },
        detail: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "review_state",
    description: "Summary of the review store for a key: totals, counts by kind/disposition, open blocking findings, suggested verdict (PASS / PASS+NOTES / FAIL).",
    inputSchema: { type: "object", required: ["key"], properties: { key: { type: "string" }, repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" } }, additionalProperties: false },
  },
  {
    name: "comments_pull",
    description: "Fetch every comment on a PR (inline + top-level), normalize them into findings via the built-in adapters (Devin Review markers, CodeRabbit severity markers, raw comments), upsert into the store, and fold ✅ Resolved replies into dispositions. The normalize step runs as code here — not as instructed judgment.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "defaults to the PR number" }, pr: { type: "number", description: "defaults to the current branch's PR" }, repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" } },
      additionalProperties: false,
    },
  },
  {
    name: "comment_add",
    description: "Post a normalized finding as an inline PR comment with the kstack-finding marker (round-trips through comments_pull). Anchored to path + line range + side.",
    inputSchema: {
      type: "object",
      required: ["kind", "severity", "path", "title", "start_line"],
      properties: {
        repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" },
        pr: { type: "number" }, kind: { type: "string", enum: KINDS }, severity: { type: "string" },
        path: { type: "string" }, start_line: { type: "number" }, end_line: { type: "number" },
        side: { type: "string", enum: ["RIGHT", "LEFT"] }, title: { type: "string" },
        body: { type: "string" }, remediation: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        based_on_repo_rules: { type: "boolean" }, id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "comment_reply",
    description: "Reply on a finding's own comment thread — carries the disposition and its evidence (the fix SHA, the refutation, the deferral trigger).",
    inputSchema: {
      type: "object", required: ["comment_id", "body"],
      properties: { comment_id: { type: "string" }, body: { type: "string" }, repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" } },
      additionalProperties: false,
    },
  },
  {
    name: "comment_resolve",
    description: "Resolve a PR review thread via GraphQL. Takes the thread id (PRRT_…), not the comment id.",
    inputSchema: {
      type: "object", required: ["thread_id"],
      properties: { thread_id: { type: "string" }, repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" } },
      additionalProperties: false,
    },
  },
  {
    name: "watch",
    description: "Diff remote PR state against the last-seen snapshot: new comments (normalized previews), newly-failing checks, pending findings. The standing-monitor primitive — fires on hook during active sessions, or call directly on 'what changed on the PR'.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "defaults to the PR number" }, repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" } },
      additionalProperties: false,
    },
  },
  {
    name: "ledger_append",
    description: "Land-time record: appends one JSONL row to the committed .kstack/ledger.jsonl (findings, mechanisms, dispositions, verdict, verified surfaces) and snapshots the findings store to .kstack/archive/<key>.json. The durable cross-unit index — call it at land before merging.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "defaults to the PR number" },
        pr: { type: "number" },
        verdict: { type: "string", description: "PASS | PASS+NOTES | FAIL — defaults to computed" },
        surfaces_verified: { type: "array", items: { type: "string" }, description: "real surfaces driven for this unit" },
        notes: { type: "string" },
        repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "doctor",
    description: "Check the wiring: node, git, gh CLI, gh auth, repo context. Run first in any session that will touch a PR — reports exactly what is missing and how to fix it.",
    inputSchema: { type: "object", properties: { repo_path: { type: "string", description: "absolute path to the consuming repo — your workspace root" } }, additionalProperties: false },
  },
];

function textResult(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function callTool(name, args) {
  switch (name) {
    case "session_context": return textResult(sessionContext(args.repo_path));
    case "finding_add": return textResult(addFinding(args.key, args, args.repo_path));
    case "finding_list": {
      const store = loadStore(args.key, args.repo_path);
      const out = store.findings.filter(f =>
        (!args.disposition || f.disposition === args.disposition) &&
        (!args.kind || f.kind === args.kind) &&
        (!args.severity || f.severity === args.severity));
      return textResult(out);
    }
    case "finding_dispose": return textResult(disposeFinding(args.key, args.id, args.disposition, args.detail, args.repo_path));
    case "review_state": return textResult(reviewState(args.key, args.repo_path));
    case "comments_pull": return textResult(commentsPull(args.key, args.pr, args.repo_path));
    case "comment_add": return textResult(commentAdd(args.pr, args, args.repo_path));
    case "comment_reply": return textResult(commentReply(args.comment_id, args.body, args.repo_path));
    case "comment_resolve": return textResult(commentResolve(args.thread_id, args.repo_path));
    case "watch": return textResult(watch(args.key, args.repo_path));
    case "ledger_append": return textResult(ledgerAppend(args.key, args.pr, { verdict: args.verdict, surfaces_verified: args.surfaces_verified, notes: args.notes }, args.repo_path));
    case "doctor": return textResult(doctor(args.repo_path));
    default: throw new Error(`unknown tool: ${name}`);
  }
}

// ---------- stdio JSON-RPC loop ----------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function handle(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize":
        return send({ jsonrpc: "2.0", id, result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "kstack-review-state", version: "1.0.0" },
        }});
      case "notifications/initialized":
      case "initialized":
        return; // notification, no response
      case "ping":
        return send({ jsonrpc: "2.0", id, result: {} });
      case "tools/list":
        return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      case "tools/call":
        return send({ jsonrpc: "2.0", id, result: callTool(params.name, params.arguments ?? {}) });
      case "notifications/cancelled":
        return;
      default:
        if (id === undefined) return; // unknown notification
        return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
    }
  } catch (err) {
    if (id === undefined) return;
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(err.message ?? err) } });
  }
}

// ---------- entry ----------

if (process.argv.includes("--self-test")) {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { chdir } = await import("node:process");
  const dir = mkdtempSync(join(tmpdir(), "kstack-test-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:acme/widgets.git"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init", "--allow-empty"], { cwd: dir, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  chdir(dir);

  let pass = 0, fail = 0;
  const t = (name, cond) => { cond ? pass++ : (fail++, process.stdout.write(`FAIL ${name}\n`)); };
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };

  // --- normalization ---
  const devinBug = normalizeComment(
    { id: 1, body: `<!-- devin-review-comment {"id":"BUG_j_0001","file_path":"a.ts","start_line":3,"end_line":3,"side":"RIGHT","based_on_repo_rules":false,"kind":"bug"} -->\n\n🔴 **Null deref**\n\nx is null here`, path: "a.ts", line: 3, side: "RIGHT", user: { login: "devin-ai-integration[bot]" } },
    "devin-ai-integration[bot]");
  t("devin marker parses kind/severity", devinBug.kind === "bug" && devinBug.severity === "severe");
  t("devin marker source attribution", devinBug.source === "devin-review");
  t("devin marker anchor", devinBug.path === "a.ts" && devinBug.start_line === 3 && devinBug.end_line === 3);
  t("devin marker title", devinBug.title === "Null deref");

  const sec = normalizeComment({ id: 2, body: `<!-- devin-review-comment {"id":"SEC_j_0001","kind":"security","file_path":"b.ts"} -->\n\n🟥 **Auth bypass**\n\nCWE-862 missing authz`, user: { login: "x[bot]" } }, "x[bot]");
  t("security square emoji → high", sec.kind === "security" && sec.severity === "high");
  t("cwe extracted", sec.cwe === "CWE-862");

  const cr = normalizeComment({ id: 3, body: "_⚠️ Potential issue_\nsomething may be off", path: "c.ts", user: { login: "coderabbitai[bot]" } }, "coderabbitai[bot]");
  t("coderabbit potential issue → non-severe bug", cr.kind === "bug" && cr.severity === "non-severe" && cr.source === "coderabbit");

  const human = normalizeComment({ id: 4, body: "are we sure this handles empty input?", user: { login: "keivan" } }, "human");
  t("unmarked human → investigate flag", human.kind === "flag" && human.severity === "investigate" && human.source === "human");

  const rawBot = normalizeComment({ id: 5, body: "this will throw on undefined", path: "d.ts", user: { login: "somebot[bot]" } }, "somebot[bot]");
  t("unmarked bot asserting defect → bug", rawBot.kind === "bug");

  // --- watch diff ---
  const s0 = { comment_ids: [], failing_checks: [], at: null };
  t("first run baselines (no alerts)", diffWatch(s0, [1, 2, 3], ["web"]).newCommentIds.length === 0);
  const s1 = { comment_ids: [1, 2, 3], failing_checks: ["web"], at: "t1" };
  t("no-change is quiet", diffWatch(s1, [1, 2, 3], ["web"]).quiet === true);
  t("new comment detected", diffWatch(s1, [1, 2, 3, 4], ["web"]).newCommentIds.includes(4));
  t("recovered check does not re-alert", diffWatch(s1, [1, 2, 3], []).quiet === true);
  t("newly failing check detected", diffWatch(s1, [1, 2, 3], ["web", "python"]).newlyFailing.includes("python"));

  // --- store: validation, dispositions, verdicts ---
  t("rejects bad kind", throws(() => addFinding("k1", { kind: "typo", severity: "severe", path: "a", title: "x" })));
  t("rejects severity/kind mismatch", throws(() => addFinding("k1", { kind: "flag", severity: "severe", path: "a", title: "x" })));
  t("rejects bad mechanism", throws(() => addFinding("k1", { kind: "bug", severity: "severe", path: "a", title: "x", mechanism: "vibes" })));
  const f1 = addFinding("k1", { kind: "bug", severity: "severe", path: "a.ts", title: "boom", mechanism: "missing-fact" });
  t("finding id prefixed", f1.id.startsWith("BUG_"));
  t("severe pending → FAIL", reviewState("k1").suggested_verdict === "FAIL");
  t("cannot dispose to pending", throws(() => disposeFinding("k1", f1.id, "pending")));
  const f2 = addFinding("k1", { kind: "flag", severity: "note", path: "b.ts", title: "fyi" });
  disposeFinding("k1", f2.id, "dismissed", "dup");
  t("non-blocking pending → still FAIL while severe open", reviewState("k1").suggested_verdict === "FAIL");
  disposeFinding("k1", f1.id, "deferred", "when X lands");
  t("all terminal → PASS", reviewState("k1").suggested_verdict === "PASS");

  const f3 = addFinding("k2", { kind: "security", severity: "low", path: "c.ts", title: "minor" });
  t("non-blocking security → PASS+NOTES", reviewState("k2").suggested_verdict === "PASS+NOTES");
  t("repoSlug ssh form", repoSlug() === "acme/widgets");

  // --- ledger + archive ---
  disposeFinding("k2", f3.id, "fixed", "sha abc");
  const l = ledgerAppend("k2", 42, { surfaces_verified: ["web"] });
  t("ledger path committed-visible", l.ledger === ".kstack/ledger.jsonl");
  const ledgerText = readFileSync(join(dir, ".kstack", "ledger.jsonl"), "utf8");
  const rows = ledgerText.trim().split("\n").map(JSON.parse);
  t("one ledger row appended", rows.length === 1);
  t("row carries pr/sha/counts", rows[0].pr === 42 && !!rows[0].sha && rows[0].findings === 1);
  t("row aggregates mechanism/disp", rows[0].by_disposition.fixed === 1);
  t("row verdict computed", rows[0].verdict === "PASS");
  t("surfaces recorded", rows[0].surfaces_verified.includes("web"));
  const archive = JSON.parse(readFileSync(join(dir, ".kstack", "archive", "k2.json"), "utf8"));
  t("archive holds full findings", archive.findings.length === 1 && archive.findings[0].title === "minor");
  ledgerAppend("k2", 42, {});
  const rows2 = readFileSync(join(dir, ".kstack", "ledger.jsonl"), "utf8").trim().split("\n");
  t("re-append is a new row (append-only)", rows2.length === 2);

  process.stdout.write(`self-test: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

if (process.argv.includes("--watch")) {
  // For the Stop hook: print a one-line nudge only when the PR changed.
  try {
    const w = watch();
    if (w.state === "no-pr" || (w.quiet && w.pending_findings === 0)) process.exit(0);
    const bits = [];
    if (w.new_comments?.length) bits.push(`${w.new_comments.length} new PR comment(s)`);
    if (w.newly_failing_checks?.length) bits.push(`newly failing checks: ${w.newly_failing_checks.join(", ")}`);
    if (w.pending_findings) bits.push(`${w.pending_findings} pending finding(s)`);
    if (bits.length) process.stdout.write(`[kstack watch] PR #${w.pr}: ${bits.join("; ")} — consider /kstack:review-loop or /kstack:fix-ci\n`);
  } catch { /* non-fatal for hooks */ }
  process.exit(0);
}

if (process.argv.includes("--doctor")) {
  const d = doctor();
  process.stdout.write(JSON.stringify(d, null, 2) + "\n");
  process.exit(d.ok ? 0 : 1);
}

if (process.argv.includes("--print-context")) {
  const ctx = sessionContext();
  if (ctx.error) process.exit(0); // non-fatal for hooks
  process.stdout.write(
    `[kstack] repo=${ctx.repo_root} branch=${ctx.branch ?? "(detached)"} base=${ctx.base_branch}@${(ctx.base_sha ?? "").slice(0, 8)} head=${(ctx.head_sha ?? "").slice(0, 8)} dirty=${ctx.dirty.length} pr=${ctx.pr ? `#${ctx.pr.number}` : "none"}\n`
  );
  process.exit(0);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); } catch { /* malformed line: skip */ }
  }
});

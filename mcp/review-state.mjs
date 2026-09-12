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
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROTOCOL_VERSION = "2024-11-05";

// ---------- git helpers ----------

function git(args, cwd = process.cwd()) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function gh(args, cwd = process.cwd()) {
  try {
    return execFileSync("gh", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function sessionContext() {
  const root = git(["rev-parse", "--show-toplevel"]);
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

function storePath(key) {
  const root = git(["rev-parse", "--show-toplevel"]);
  if (!root) throw new Error("not inside a git repository");
  const safe = String(key).replace(/[^a-zA-Z0-9._-]/g, "-");
  const dir = join(root, ".kstack", "review");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${safe}.json`);
}

function loadStore(key) {
  const p = storePath(key);
  if (!existsSync(p)) return { key, findings: [] };
  return JSON.parse(readFileSync(p, "utf8"));
}

function saveStore(key, store) {
  writeFileSync(storePath(key), JSON.stringify(store, null, 2) + "\n");
  // The store defaults to local-only: exclude it per-checkout via
  // .git/info/exclude without touching the repo's .gitignore.
  try {
    const gitDir = git(["rev-parse", "--git-dir"]);
    if (gitDir) {
      const root = git(["rev-parse", "--show-toplevel"]);
      const excludePath = join(root, gitDir, "info", "exclude");
      const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
      if (!existing.split("\n").some(l => l.trim() === ".kstack/")) {
        writeFileSync(excludePath, existing.replace(/\n?$/, "\n") + ".kstack/\n");
      }
    }
  } catch { /* non-fatal: store still works, just not auto-excluded */ }
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

function addFinding(key, f) {
  const errors = validateFinding(f);
  if (errors.length) throw new Error(errors.join("; "));
  const store = loadStore(key);
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
  saveStore(key, store);
  return finding;
}

function disposeFinding(key, id, disposition, detail) {
  if (!DISPOSITIONS.includes(disposition) || disposition === "pending")
    throw new Error(`disposition must be a terminal one of: ${DISPOSITIONS.filter(d => d !== "pending").join(", ")}`);
  const store = loadStore(key);
  const finding = store.findings.find(x => x.id === id);
  if (!finding) throw new Error(`no finding with id ${id}`);
  finding.disposition = disposition;
  finding.disposition_detail = detail ?? null;
  finding.resolved_at = new Date().toISOString();
  saveStore(key, store);
  return finding;
}

function reviewState(key) {
  const store = loadStore(key);
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

function repoSlug() {
  const url = git(["remote", "get-url", "origin"]) ?? "";
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error("cannot determine owner/repo from origin remote");
  return m[1];
}

function currentPrNumber() {
  const out = gh(["pr", "view", "--json", "number"]);
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
  const marker = c.body?.match(/<!--\s*(?:devin-review-comment|kstack-finding)\s+(\{[^}]*\})\s*-->/);
  let meta = {};
  if (marker) { try { meta = JSON.parse(marker[1]); } catch { meta = {}; } }

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

function commentsPull(key, pr) {
  const slug = repoSlug();
  const n = pr ?? currentPrNumber();
  if (!n) throw new Error("no PR for the current branch; pass pr explicitly");
  const inline = JSON.parse(gh(["api", `repos/${slug}/pulls/${n}/comments`, "--paginate"]) ?? "[]");
  const topLevel = JSON.parse(gh(["api", `repos/${slug}/issues/${n}/comments`, "--paginate"]) ?? "[]");

  const store = loadStore(key ?? String(n));
  const byId = new Map(store.findings.map(f => [f.id, f]));
  let added = 0, updated = 0;

  const humanish = (login) => !/\[bot\]$|bot$/i.test(login) ? "human" : login;

  for (const c of [...inline, ...topLevel]) {
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
  saveStore(store.key, store);
  return { pr: n, total: store.findings.length, added, updated, pending: store.findings.filter(f => f.disposition === "pending").length };
}

function commentAdd(pr, f) {
  const slug = repoSlug();
  const n = pr ?? currentPrNumber();
  if (!n) throw new Error("no PR for the current branch; pass pr explicitly");
  const headSha = gh(["pr", "view", String(n), "--json", "headRefOid", "--jq", ".headRefOid"]);
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
  const out = gh(["api", `repos/${slug}/pulls/${n}/comments`, "-X", "POST", "--input", tmp]);
  if (!out) throw new Error("gh api failed posting the comment");
  const posted = JSON.parse(out);
  return { id: f.id, comment_id: posted.id, html_url: posted.html_url };
}

function commentReply(commentId, body) {
  const slug = repoSlug();
  const tmp = `${process.env.TMPDIR ?? "/tmp"}kstack-reply-${Date.now()}.json`;
  writeFileSync(tmp, JSON.stringify({ body }));
  const out = gh(["api", `repos/${slug}/pulls/comments/${commentId}/replies`, "-X", "POST", "--input", tmp]);
  if (!out) throw new Error("gh api failed posting the reply");
  const posted = JSON.parse(out);
  return { comment_id: posted.id, html_url: posted.html_url };
}

function commentResolve(threadId) {
  const out = gh(["api", "graphql", "-f", `query=mutation { resolveReviewThread(input:{threadId:"${threadId}"}) { thread { isResolved } } }`]);
  if (!out) throw new Error("gh api graphql failed — resolveReviewThread needs a GraphQL thread id (PRRT_…), not a comment id");
  return JSON.parse(out);
}

function doctor() {
  const checks = {
    node: process.version,
    git: git(["--version"]),
    gh_cli: gh(["--version"])?.split("\n")[0] ?? null,
    gh_auth: null,
    repo: git(["rev-parse", "--show-toplevel"]),
    gh_pr_view: null,
  };
  const auth = gh(["auth", "status"]);
  checks.gh_auth = auth ? "ok" : (() => { try { execFileSync("gh", ["auth", "status"], { stdio: ["ignore", "pipe", "pipe"] }); return "ok"; } catch { return "missing"; } })();
  checks.gh_pr_view = checks.repo && checks.gh_auth === "ok" ? "ok" : "unverified";
  const missing = Object.entries(checks).filter(([k, v]) => v === null || v === "missing").map(([k]) => k);
  return { ok: missing.length === 0, checks, missing, guidance: missing.length ? "install/authenticate the missing pieces; gh CLI is required for PR I/O (brew install gh && gh auth login)" : "fully wired" };
}

// ---------- MCP tool surface ----------

const TOOLS = [
  {
    name: "session_context",
    description: "The unit's ground truth: repo root, branch, HEAD, base branch and BASE sha, upstream/ahead-behind, dirty files, and the PR (number/base/state) when one exists.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "finding_add",
    description: "Add a normalized review finding to the store. Keyed by PR number or branch name. Schema per skills/review-loop/references/finding-schema.md.",
    inputSchema: {
      type: "object",
      required: ["key", "kind", "severity", "path", "title"],
      properties: {
        key: { type: "string", description: "PR number or branch name" },
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
        key: { type: "string" }, id: { type: "string" },
        disposition: { type: "string", enum: DISPOSITIONS.filter(d => d !== "pending") },
        detail: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "review_state",
    description: "Summary of the review store for a key: totals, counts by kind/disposition, open blocking findings, suggested verdict (PASS / PASS+NOTES / FAIL).",
    inputSchema: { type: "object", required: ["key"], properties: { key: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "comments_pull",
    description: "Fetch every comment on a PR (inline + top-level), normalize them into findings via the built-in adapters (Devin Review markers, CodeRabbit severity markers, raw comments), upsert into the store, and fold ✅ Resolved replies into dispositions. The normalize step runs as code here — not as instructed judgment.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "defaults to the PR number" }, pr: { type: "number", description: "defaults to the current branch's PR" } },
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
      properties: { comment_id: { type: "string" }, body: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "comment_resolve",
    description: "Resolve a PR review thread via GraphQL. Takes the thread id (PRRT_…), not the comment id.",
    inputSchema: {
      type: "object", required: ["thread_id"],
      properties: { thread_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "doctor",
    description: "Check the wiring: node, git, gh CLI, gh auth, repo context. Run first in any session that will touch a PR — reports exactly what is missing and how to fix it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function textResult(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function callTool(name, args) {
  switch (name) {
    case "session_context": return textResult(sessionContext());
    case "finding_add": return textResult(addFinding(args.key, args));
    case "finding_list": {
      const store = loadStore(args.key);
      const out = store.findings.filter(f =>
        (!args.disposition || f.disposition === args.disposition) &&
        (!args.kind || f.kind === args.kind) &&
        (!args.severity || f.severity === args.severity));
      return textResult(out);
    }
    case "finding_dispose": return textResult(disposeFinding(args.key, args.id, args.disposition, args.detail));
    case "review_state": return textResult(reviewState(args.key));
    case "comments_pull": return textResult(commentsPull(args.key, args.pr));
    case "comment_add": return textResult(commentAdd(args.pr, args));
    case "comment_reply": return textResult(commentReply(args.comment_id, args.body));
    case "comment_resolve": return textResult(commentResolve(args.thread_id));
    case "doctor": return textResult(doctor());
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

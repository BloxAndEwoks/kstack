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
}

const KINDS = ["bug", "security", "flag"];
const SEVERITIES = {
  bug: ["severe", "non-severe"],
  security: ["critical", "high", "medium", "low"],
  flag: ["investigate", "note"],
};
const DISPOSITIONS = ["pending", "fixed", "refuted", "deferred", "accepted-risk", "dismissed"];

function validateFinding(f) {
  const errors = [];
  if (!KINDS.includes(f.kind)) errors.push(`kind must be one of ${KINDS.join(", ")}`);
  if (f.kind && f.severity && !SEVERITIES[f.kind]?.includes(f.severity))
    errors.push(`severity "${f.severity}" invalid for kind "${f.kind}"`);
  if (!f.path) errors.push("path required");
  if (!f.title) errors.push("title required");
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

# kstack

The bookended PR loop, portable to any agent host that reads `SKILL.md`.

**`task → worktree → commits → PR → normalized review → merge-ready handoff`**

Devin's cloud sessions work this way: an isolated environment, a PR as the output
artifact, an independent review pass, and the owner merges. This plugin reproduces
that loop as skills + an MCP server, so the same discipline runs in Devin CLI,
Devin Desktop, Claude Code, Cursor, or any agent that speaks plugins and MCP.

## What it is not

It is not a process framework. No ledger, no mandatory subagent fan-out, no
reflection step between the work and the PR. The loop is thin on purpose — the
previous incarnation of this idea grew recursive meta-machinery and spiraled.
Depth is opt-in and lives in the repo's own rules.

## Install

```bash
# Devin CLI / Desktop
devin plugins install BloxAndEwoks/kstack
# or, for authoring, a local path:
devin plugins install ~/Documents/kstack
```

Agent Plugins 1.0.0 root manifest (`plugin.json`) is present, so any spec-compliant
host loads it the same way. `.devin-plugin/`, `.claude-plugin/`, `.codex-plugin/`,
and `.cursor-plugin/` manifests cover the native formats — Codex picks up `skills`,
`hooks`, `mcpServers`, and the marketplace `interface` block from its manifest.

## The surface

| piece | what it does |
|---|---|
| `/kstack:loop` | Router — captures BASE, opens the worktree, matches a playbook |
| `loop/playbooks/` | `feature` `bugfix` `perf` `docs` `chore` `investigate` `stack` |
| `/kstack:commit` | Convention-matched commits |
| `/kstack:open-pr` `/kstack:update-pr` | PR open/update with the Summary + Verification body contract |
| `/kstack:review` | The independent review pass — Devin Review's taxonomy locally |
| `/kstack:review-loop` | Normalizes every review source into findings; dispositions each |
| `/kstack:verify` | The verification contract — two seats (pre-design look, post-build drive), self-maintaining at the point of use: bootstraps when absent, health-checks when present, drifts fork to recipe-fix or product-finding |
| `/kstack:fix-ci` | Failed-check triage: real failure vs infra flake vs stale |
| `/kstack:sync` `/kstack:sync-upstream` | Upstream sync/publish; upstream-wins rebases |
| `/kstack:merge` `/kstack:land` | Local merge; merge-readiness gate + owner handoff |
| `/kstack:run-commands` | Session run-command setup (`tasks.json` + `worktreeCreated`) |
| `/kstack:learn` | Durable learning capture to the repo's rules/docs/skills |
| `agents/reviewer` | Non-author reviewer subagent profile (local hosts) |
| `kstack` MCP server | `session_context` + the findings store for any harness |

## The QA layer

The spine is the **finding schema** (`skills/review-loop/references/finding-schema.md`)
— Devin Review's protocol made portable: kinds `bug`/`security`/`flag`, severities
per kind, `confidence`, `cwe`, `based_on_repo_rules`, and terminal dispositions
(`fixed`/`refuted`/`deferred`/`accepted-risk`/`dismissed`). Adapters normalize
Devin Review markers, CodeRabbit, and raw comments into it. Every finding gets a
disposition with evidence posted on its own thread; nothing pending at `land`.

## The MCP server

`mcp/review-state.mjs` is a zero-dependency Node stdio server. Declared in
`.mcp.json` (Agent Plugins) — hosts that support plugin MCP servers get:

- `session_context` — repo/branch/BASE/PR ground truth in one call
- `doctor` — wiring check (node, git, gh, gh auth) with fix guidance
- `finding_add` / `finding_list` / `finding_dispose` / `review_state` — the
  normalized findings store at `.kstack/review/<key>.json` in the consuming repo
- `comments_pull` — fetch + normalize every PR comment through the adapters *in
  code*, folding `✅ Resolved` replies into dispositions
- `comment_add` / `comment_reply` / `comment_resolve` — the inline-comment
  channel (the `addComment`/`listComments`/`resolveComments` equivalent),
  provisioned over `gh`

Hosts without plugin MCP: the skills fall back to `gh` + the same store files —
the store is plain JSON, no tool required. `node mcp/review-state.mjs --doctor`
reports the wiring on any host.

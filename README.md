# kstack

The bookended PR loop, portable to any agent host that reads `SKILL.md`.

**`task → worktree → commits → PR → normalized review → merge-ready handoff`**

In a repo with its own process file and router, `loop` yields — the repo's
process runs, and kstack's skills remain available as a toolbox inside it.

Devin's cloud sessions work this way: an isolated environment, a PR as the output
artifact, an independent review pass, and the owner merges. This plugin reproduces
that loop as skills + an MCP server, so the same discipline runs in Devin CLI,
Devin Desktop, Claude Code, Cursor, or any agent that speaks plugins and MCP.

## What it is not

It is not a process framework. No ledger, no mandatory subagent fan-out, no
reflection step between the work and the PR. The loop is thin on purpose — the
previous incarnation of this idea grew recursive meta-machinery and spiraled.
Depth is opt-in and lives in the repo's own rules.

## Requirements — not optional

kstack's QA layer is mechanical only where these exist. A host without them
degrades to the prose instructions — the loop still reads, but findings,
comments, watch, and merge-readiness lose their teeth.

- **`git`** — everywhere.
- **`gh` CLI, authenticated** — the comment channel, `watch`, `fix-ci`, and
  `land` all speak GitHub through it. If the agent can't do this itself:
  ```bash
  brew install gh        # or your package manager
  gh auth login          # browser flow; needs repo + pull-requests scopes
  ```
- **`node`** (≥ 18) — runs the MCP server. `node --version` to check.
- **The `kstack` MCP server wired** — declared per-manifest, but if your host
  didn't start it, add it manually:
  ```bash
  devin mcp add kstack -- node <path-to-plugin>/mcp/review-state.mjs
  # Claude Code: claude mcp add kstack -- node <path>/mcp/review-state.mjs
  # Codex: mcp_servers in ~/.codex/config.toml — [mcp_servers.kstack]
  #        command = "node", args = ["<path>/mcp/review-state.mjs"]
  # Cursor is the exception: its GUI PATH has no node, so the manifest
  # uses /bin/sh <path>/mcp/run.sh rather than a manual `node` entry.
  ```
  Verify any time: `/bin/sh <path>/mcp/run.sh --doctor` prints what's
  wired and what's missing, with fix guidance. The same check exists three
  ways: the CLI flag (works even when the server won't start), the `doctor`
  MCP tool, and the `/kstack:doctor` skill — the entry point for when the MCP
  layer itself is the thing that's down.

## Install

```bash
# Devin CLI / Desktop (requires devin auth login; plugins are closed beta)
devin plugins install BloxAndEwoks/kstack
# or, for authoring, a local path:
devin plugins install ~/Documents/kstack
```

```bash
# Codex — via a marketplace catalog:
codex plugin marketplace add BloxAndEwoks/kstack
# then install "kstack" from the plugin browser, or point a marketplace entry
# at this folder in .agents/plugins/marketplace.json (repo) or
# ~/.agents/plugins/marketplace.json (personal)
```

```text
# Claude Code — as a plugin repo, or copy/symlink the skill dirs into
# .claude/skills/ for repo-scoped use.
# Cursor — .cursor-plugin manifest; rules/skills per its plugin support.
```

Agent Plugins 1.0.0 root manifest (`plugin.json`, closed spec schema) plus the
spec's `mcp.json` MCP declaration — spec-compliant hosts load both.
`.devin-plugin/`, `.claude-plugin/`, `.codex-plugin/`, and `.cursor-plugin/`
manifests cover the native formats, each declaring the server inline with that
host's own path convention (Codex: relative `cwd`; Claude: `${CLAUDE_PLUGIN_ROOT}`;
Devin: `${PLUGIN_ROOT}`).

**Verified host loading** (as of this branch):

- **Codex** — full pass: `codex plugin marketplace add` + `codex plugin add`
  installs it, `codex mcp list` shows `kstack` enabled with the server resolved
  to the plugin cache path and `PLUGIN_ROOT`/`PLUGIN_DATA` injected, and the
  plugin `AGENTS.md` loads as an always-on rule.
- **Claude Code** — `claude plugin validate` passes; session-level loading via
  `claude --plugin-dir <path>` (needs a signed-in CLI).
- **Devin** — `devin plugins install <path>` once authenticated.
- **Cursor** — `.cursor-plugin` launches `/bin/sh ./mcp/run.sh` with `cwd`
  `${PLUGIN_ROOT}`. A Dock-launched Cursor has a stripped PATH (`spawn node ENOENT`),
  so the manifest must not use bare `node`. `mcp/run.sh` finds Node and puts
  Homebrew/nvm/fnm on PATH before starting `review-state.mjs`.

## Invoke

Entry point is the router:

```text
/kstack:unit add retry-with-backoff to the engine worker
```

A unit can also arrive from a spec — `/kstack:unit PRD-auth phase 2`. Author the
PRD however your harness plans (native plan mode, free-flow, by hand); the
plugin owns the artifact's *shape* (`templates/PRD.template.md` — requirements,
non-goals, acceptance, ordered phases), the harness owns the modality. The
router consumes the PRD; it doesn't police how it was written.

or let the host auto-route — every skill description declares when it fires
("route a task", "failed checks", "review this"). The bookend skills are also
directly callable: `/kstack:open-pr`, `/kstack:review`, `/kstack:review-loop`,
`/kstack:fix-ci`, `/kstack:sync`, `/kstack:land`, `/kstack:verify-contract`,
`/kstack:learn`, `/kstack:commit`, `/kstack:update-pr`, `/kstack:merge`,
`/kstack:sync-upstream`, `/kstack:run-commands`. On Codex, `@kstack` invokes the
plugin explicitly.

## The surface

| piece | what it does |
|---|---|
| `/kstack:unit` | Router — captures BASE, opens the worktree, matches a playbook |
| `loop/playbooks/` | `feature` `bugfix` `perf` `docs` `chore` `investigate` `stack` |
| `/kstack:commit` | Convention-matched commits |
| `/kstack:open-pr` `/kstack:update-pr` | PR open/update with the Summary + Verification body contract |
| `/kstack:review` | The independent review pass — Devin Review's taxonomy locally |
| `/kstack:review-loop` | Normalizes every review source into findings; dispositions each |
| `/kstack:verify-contract` | The verification contract — two seats (pre-design look, post-build drive), self-maintaining at the point of use: bootstraps when absent, health-checks when present, drifts fork to recipe-fix or product-finding |
| `/kstack:fix-ci` | Failed-check triage: real failure vs infra flake vs stale |
| `/kstack:sync` `/kstack:sync-upstream` | Upstream sync/publish; upstream-wins rebases |
| `/kstack:merge` `/kstack:land` | Local merge; merge-readiness gate + owner handoff |
| `/kstack:run-commands` | Session run-command setup (`tasks.json` + `worktreeCreated`) |
| `/kstack:learn` | Durable learning capture to the repo's rules/docs/skills |
| `agents/reviewer` | Non-author reviewer subagent profile (local hosts) |
| `kstack` MCP server | `session_context` + the findings store for any harness |
| `loop/references/testing.md` | Testing doctrine — behavior-first, the AI failure modes, suite health, perf-testing rules; cited by playbooks, the reviewer, and the repo template |
| `templates/AGENTS.template.md` | Minimal repo profile for repos without one — `loop` offers it once, only when no procedure file exists |

## The QA layer

The spine is the **finding schema** (`skills/review-loop/references/finding-schema.md`)
— Devin Review's protocol made portable: kinds `bug`/`security`/`flag`, severities
per kind, `confidence`, `cwe`, `based_on_repo_rules`, and terminal dispositions
(`fixed`/`refuted`/`deferred`/`accepted-risk`/`dismissed`). Adapters normalize
Devin Review markers, CodeRabbit, and raw comments into it. Every finding gets a
disposition with evidence posted on its own thread; nothing pending at `land`.

## The MCP server

`mcp/review-state.mjs` is a zero-dependency Node stdio server. Claude Code,
Codex, and Devin spawn `node` on the host's path convention (Codex: `cwd: "."`
plus a relative arg; Claude: `${CLAUDE_PLUGIN_ROOT}`; Devin: `${PLUGIN_ROOT}`).
They inherit a shell PATH, and they don't show an MCP connection status.
Cursor does, and a Dock launch's PATH cannot see `node` (`spawn node ENOENT`),
so `.cursor-plugin` runs `/bin/sh ./mcp/run.sh` with `cwd` `${PLUGIN_ROOT}`
(Cursor expands that variable in `cwd` only). The spec `mcp.json` uses the
same launcher, which finds `node` on PATH when the host already has one.
Plugin MCP servers spawn with `cwd` = plugin root, so every tool also accepts
a `path` argument (the agent's workspace) and falls back
through `DEVIN_PROJECT_DIR` → `CLAUDE_PROJECT_DIR` → `CODEX_PROJECT_ROOT` →
process cwd. Tools:

- `session_context` — repo/branch/BASE/PR ground truth in one call
- `doctor` — wiring check (node, git, gh, gh auth) with fix guidance
- `finding_add` / `finding_list` / `finding_dispose` / `review_state` — the
  normalized findings store at `.kstack/review/<key>.json` in the consuming repo
- `comments_pull` — fetch + normalize every PR comment through the adapters *in
  code*, folding `✅ Resolved` replies into dispositions
- `comment_add` / `comment_reply` / `comment_post` / `comment_resolve` /
  `comment_delete` — the full comment channel (inline findings, thread replies,
  top-level verdicts, resolution, deletion — the cloud `addComment`/
  `listComments`/`resolveComments`/`deleteComments` equivalents) over `gh`;
  all exercised live against this repo's own PR
- `watch` — diffs remote PR state against a stored snapshot (new comments,
  newly-failing checks, pending findings). Wired to the `Stop` hook, so PR
  traffic surfaces between turns during an active session — the local
  approximation of the cloud's standing monitor
- `ledger_append` — the land-time record: one committed JSONL row per unit in
  `.kstack/ledger.jsonl` (findings, mechanisms, dispositions, verdict, verified
  surfaces) plus the full findings snapshot in `.kstack/archive/`. This is the
  queryable index over units that merged-PR pages can't give you —
  `jq` the ledger, read the archive for detail

State layering: **PR = the conversation, `.kstack/ledger.jsonl` = the index over
conversations, `AGENTS.md` = distilled lessons** (via `learn`). Live working sets
(`.kstack/review/`) stay local; records commit. On-demand document templates
(PRD, ADR, ops note) live in `templates/` — triggered when warranted, never
mandated; see `skills/unit/references/artifacts.md`.

Hosts without plugin MCP: the skills fall back to `gh` + the same store files —
the store is plain JSON, no tool required. `/bin/sh mcp/run.sh --doctor`
reports the wiring on any host.

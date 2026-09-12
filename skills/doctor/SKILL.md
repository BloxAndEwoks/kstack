---
name: doctor
description: Diagnose kstack wiring — the entry point when the MCP server is down or unreachable. Runs the CLI doctor, reports what's missing (node, git, gh, gh auth, repo, PR access), and gives the fix for each. Invoke on "check kstack", "kstack broken", or when any kstack MCP tool call fails.
---

# Doctor — diagnose kstack wiring when the MCP layer may be down

The `doctor` MCP tool checks the wiring — but if the MCP server itself isn't
running, that tool can't be called. This skill exists for exactly that case:
it runs the same check as a plain command.

## Run it

The server lives at `mcp/review-state.mjs` inside the installed kstack plugin
directory. Locate it (the plugin install path, or this skill's own directory
two levels up) and run:

```bash
node <kstack-plugin>/mcp/review-state.mjs --doctor
```

The output is JSON: `checks` (node, git, gh CLI, gh auth, repo, PR access),
`missing`, and `guidance`. Anything in `missing` is a blocker for the
mechanical QA layer — report it with its fix, don't silently degrade.

## What each missing check means

- `node` — the MCP server can't run at all; install Node ≥ 18.
- `git` — no store, no worktrees; install git.
- `gh_cli` / `gh_auth` — the comment channel, watch, fix-ci, and land all need
  `gh` authenticated: `brew install gh && gh auth login`. Without it the plugin
  degrades to prose instructions — say so.
- `repo` — the command ran outside a git repository, or the `repo_path`
  argument/env vars didn't resolve to one.
- `gh_pr_view` — gh is present but can't see the PR surface (wrong repo,
  missing `repo` scope, or no network).

## If the server IS running

`doctor` is also an MCP tool — same check, same output. Prefer whichever
reaches the server; they are identical.

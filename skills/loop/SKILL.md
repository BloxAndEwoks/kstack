---
name: loop
description: Route a task into the bookended PR loop. Invoke at the start of any task meant to end as a PR — features, fixes, perf work, docs, chores, investigations. Captures BASE, opens the worktree, matches a playbook, and carries the task through review to a merge-ready handoff. Do not invoke for casual questions or tasks with no code artifact.
---

# loop — the bookend router

One sentence of contract: **a task enters here and exits as a merge-ready PR.**

The repo's own procedure file (`AGENTS.md`, `CONTRIBUTING.md`, or equivalent) outranks
this plugin on every repo-specific question — commands, deploy policy, who merges,
review conventions. Read it first when it exists.

## Step 0 — context

Run these before any planning; they are the unit's ground truth:

```bash
git rev-parse --show-toplevel          # repo root
git rev-parse HEAD                     # BASE — the commit this unit builds on
git branch --show-current              # current branch
git status --porcelain                 # dirty state — uncommitted work is a fact, not a detail
```

If the `kstack` MCP server is connected, `session_context` returns all of this in one call.

## Step 1 — isolate

The unit gets its own branch. In a worktree when the repo or the task benefits from
isolation (parallel work, a dirty main checkout, destructive experiments):

```bash
git worktree add ../<repo>-<slug> -b <type>/<slug>
```

Branch naming: `<type>/<slug>` where type is the playbook name (`feature/`, `fix/`,
`perf/`, `docs/`, `chore/`, `investigate/`, `stack/`). Two to five words, lowercase,
hyphenated. The worktree keeps the unit's blast radius out of the user's checkout —
that is the local equivalent of a cloud session's VM.

A task on an existing branch or in an existing worktree skips this step.

## Step 2 — match

| Playbook | The task is… |
|---|---|
| `playbooks/feature.md` | New or changed behavior |
| `playbooks/bugfix.md` | A reported or observed defect |
| `playbooks/perf.md` | Measured slowness to trace and improve against a baseline |
| `playbooks/docs.md` | Documentation, comments, READMEs, ADRs — prose artifacts only |
| `playbooks/chore.md` | Dependencies, config, tooling, cleanup — no behavior change |
| `playbooks/investigate.md` | Read-only: answer a question about the code. Deliverable is a cited answer, not a PR |
| `playbooks/stack.md` | An ordered set of dependent units to land as a PR stack |

When two playbooks match, pick the one whose deliverable the user named. When none
match cleanly, use `feature.md` — it is the superset.

## Step 3 — run the playbook

Open the matched playbook and follow its steps. Every playbook ends the same way:
`open-pr` → `review` → `review-loop` → `fix-ci` as needed → `land`.

## What the router deliberately does not do

- No mandatory subagent fan-out. Delegate when the playbook says to or when the task
  is too big for one context — not by default.
- No process ledger. Learnings go through `/kstack:learn` when they are worth keeping.
- No meta-reflection step. The loop's quality lives in the review protocol, not in
  reviewing the process.

---
name: unit
description: Route a task into the bookended PR loop — captures BASE, isolates, matches a playbook, carries it to a merge-ready PR. Use for any task meant to end as a PR.
---

# unit — the bookend router

One sentence of contract: **a unit enters here and exits as a merge-ready PR.**
A unit is the work behind one PR — a named goal, one to five commits. A task
with two goals is two units.

The repo's own procedure file (`AGENTS.md`, `CONTRIBUTING.md`, or equivalent) outranks
this plugin on every repo-specific question — commands, deploy policy, who merges,
review conventions. Read it first when it exists.

**Intake from a spec.** A unit may arrive as a PRD section, an issue, or a task
sentence — the artifact is the contract, not the process that produced it.
Author the PRD however the harness plans (native plan mode, free-flow, by hand);
the template (`templates/PRD.template.md`) defines what "ready" looks like —
requirements with verification, non-goals, acceptance, and ordered `## Phases`.
Routing "`PRD-<x> phase <n>`" means: run that phase's units in order, `stack`
when they're dependent.

## Step 0 — context

Run these before any planning; they are the unit's ground truth:

```bash
git rev-parse --show-toplevel          # repo root
git rev-parse HEAD                     # BASE — the commit this unit builds on
git branch --show-current              # current branch
git status --porcelain                 # dirty state — uncommitted work is a fact, not a detail
```

If the `kstack` MCP server is connected, `session_context` returns all of this in
one call and `doctor` reports the wiring (node / git / gh / gh auth) — anything
missing gets fixed before the unit starts, because the loop's later stages depend
on it. Pass `repo_path` = the repo root to every kstack tool call — the server
may spawn outside the workspace and needs to be pointed at the consuming repo.

## Step 0.5 — procedure file

- **Repo has a procedure file naming its own build process or router** (its
  `AGENTS.md` says "work enters through X", or names its own playbooks) →
  **yield**. Report the repo's router and stop routing — the repo's process runs;
  kstack's other skills remain callable as a toolbox inside it.
- **No procedure file at all** → offer to scaffold one from
  `templates/AGENTS.template.md` (repo profile: commands, machine constraints,
  verification pointer, merge policy). One offer per repo; decline means proceed
  without one.
- **Procedure file exists but names no process** → it parameterizes this loop;
  proceed.

## Step 1 — isolate

The unit gets its own branch. In a worktree when the repo or the task benefits from
isolation (parallel work, a dirty main checkout, destructive experiments):

```bash
git worktree add ../<repo>-<slug> -b <type>/<slug>
```

A fresh worktree contains **only tracked files** — gitignored env files
(`.env`, `.env.local`, credentials, local config) do not follow it. After
creating the worktree, carry them across:

```bash
# secrets: symlink, don't copy — one file, one permission boundary,
# no drift, no second copy to leak
for f in .env .env.local .env.*.local; do
  [ -f "$f" ] && ln -s "$(pwd)/$f" "../<repo>-<slug>/$f"
done
```

Security rules:
- **Symlink secrets, copy only non-secret fixtures.** A copied `.env` is a
  second copy of real credentials — it drifts, it lingers, and it can land in
  places the original never would.
- **Never put a worktree (or its env files) on a synced or shared path** —
  `~/Documents` may be iCloud-synced; a copied `.env` there syncs to the cloud.
  Sibling dirs and `/tmp` are fine; synced folders are not.
- Check `git status --ignored` in the main checkout for what else won't be
  there — fixtures, local DBs, cert files. If the repo has `run-commands`
  entries with `runOn: "worktreeCreated"`, they may already cover this —
  check `.vscode/tasks.json` first.

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

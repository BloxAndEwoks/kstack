---
name: verify
description: Execute the repo's verification contract — discover how this repo verifies (its verify-* skill, VERIFY.md, CI workflows, build tooling), run the check suite, and drive the changed behavior on the real surface. Sits in two seats — before design (current behavior) and after build (the unit's change). Self-maintaining: bootstraps the contract when absent, health-checks it when present.
---

# Verify — the verification contract, run and maintained at the point of use

Cloud sessions get a provisioned VM and learned repo knowledge; locally, what a
session needs to *verify* has to live somewhere discoverable and *stay true*.
This skill owns both — the run and the contract lifecycle — inside the one step
every playbook already routes through. There is no separate policing step; the
run is the police.

## The contract lookup — in priority order

1. **The repo's own `verify-*` skill.** If the repo ships one (e.g.
   `.claude/skills/verify-<project>/`), it is the contract — it knows the real
   surface. Run it as written. Nothing below substitutes for it.
2. **A verification contract file** — `VERIFY.md` at the repo root (committed,
   canonical) or `.kstack/verify.md`. The repo's stated answers: how to
   provision, how to launch, what the real surfaces are, what "driven" means.
   The contract is repo knowledge — it belongs in git so every checkout and
   session sees it.
3. **CI workflows** — `.github/workflows/*.yml`. CI is the canonical machine-
   readable "what must pass": the job steps are the check suite. Run them locally
   in the same order.
4. **Build tooling discovery** — `Makefile`, `package.json` scripts,
   `pyproject.toml`, `Cargo.toml`, `go.mod`. Infer install / lint / typecheck /
   test from what exists.

## Two seats

- **Before design** — for work on a shipped surface: read the touched surfaces'
  mapped features and take a live look at current behavior where that is
  genuinely informative. Design from how the product behaves today, not from
  memory.
- **After build** — run the repo-level smoke first, then drive the unit's changed
  surface the way its consumer meets it: the app, the CLI, the endpoint, the
  rendered doc. "Inconclusive" or wrong-surface is not a pass.

## The contract lifecycle — inside the run

**Absent → bootstrap.** When the lookup chain bottoms out at tooling discovery
and the repo has a shipped surface (a dev/serve/CLI entry point exists), the run
writes `VERIFY.md` at the repo root itself — committed, since it is repo
knowledge, not session state: the discovered launch commands, the check suite,
and the one surface this unit touched with its entry point. Mechanical, not a
judgment call. A repo that cannot state how to launch its own surface is a
finding about the repo — say so and fix it here.

**Present → health-check first.** Before driving, cheaply verify the contract:
does the launch recipe still launch, do the named entry points still exist? Then
drive. The health check is a command, not a walk.

**Drift → the fork.** A failed recipe is a fork, never an edit-and-move-on:
- *Recipe wrong* (the product works, the contract is stale) → fix the recipe,
  re-drive, note the update.
- *Product wrong* (the contract is right, the product moved) → a finding into
  `/kstack:review-loop` triage, or straight back into the unit's fix.

**Bounded by contact.** The contract grows one surface at a time — only surfaces
a unit actually touched earn entries. Never enumerate the whole product; a repo
that wants the full enumerated map writes `VERIFY.md` itself (or adopts the
repo-level skill).

## Output

Report per seat: what was driven, on which surface, with what outcome — real
paths and results, never command names alone. Note the contract action taken
(bootstrapped / healthy / recipe-fixed / product-finding). Verification language
lands in the PR's `## Verification` section verbatim.

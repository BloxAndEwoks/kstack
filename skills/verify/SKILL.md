---
name: verify
description: Execute the repo's verification contract — discover how this repo verifies (its verify-* skill, VERIFY.md, CI workflows, build tooling), run the check suite, and drive the changed behavior on the real surface. Sits in two seats — before design (current behavior) and after build (the unit's change). Use on "verify this", at playbook step, or whenever the real surface must be driven.
---

# Verify — the verification contract, discovered and honored

Cloud sessions get a provisioned VM and learned repo knowledge; locally, what a
session needs to *verify* has to live somewhere discoverable. This skill is that
place: a lookup chain, a run, and a write-back so the next session doesn't
rediscover.

## The contract lookup — in priority order

1. **The repo's own `verify-*` skill.** If the repo ships one (e.g.
   `.claude/skills/verify-<project>/`), it is the contract — it knows the real
   surface. Run it as written. Nothing below substitutes for it.
2. **A verification contract file** — `VERIFY.md` or `.kstack/verify.md` in the
   repo root. The repo's stated answers: how to provision, how to launch, what
   the real surfaces are, what "driven" means.
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

## Provisioning the surface

Driving the real surface often needs a running thing. Check, in order: the
contract file's launch instructions → `run-commands` entries (`tasks.json` with
`inAgents`) → the repo's documented dev/serve commands → `environment.yaml` if the
repo carries one (its install/commands are discoverable even when no cloud
session runs it). A repo that cannot state how to launch its own surface is a
finding about the repo — surface it, and let `/kstack:learn` fix the gap.

## Write-back — the local Knowledge mechanism

When verification required discovery — the launch command nobody documented, the
env var, the right smoke order, the surface entry points — **the run writes the
contract**: append to `.kstack/verify.md` (or the repo's chosen file) what a fresh
session would need. Small, factual, dated. This is the local equivalent of cloud
Knowledge: learned, stored with the repo, found by the next session.

## Output

Report per seat: what was driven, on which surface, with what outcome — real
paths and results, never command names alone. Verification language lands in the
PR's `## Verification` section verbatim.

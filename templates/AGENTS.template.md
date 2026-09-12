# Agent Instructions

This is the repository profile — what this repo knows about itself that no code
or plugin can carry. kstack supplies the loop (`/kstack:loop`); this file is the
authority on this repo's specifics.

## Commands

```bash
# <install/build command>
# <test command>
# <lint/typecheck commands>
```

## Verification

The verification contract lives at `VERIFY.md` (committed) — `/kstack:verify`
bootstraps it on first use and health-checks it on every use. The real surfaces
this repo ships and how to drive them: <list them>.

## Records

Each landed unit appends a row to the committed `.kstack/ledger.jsonl`
(findings, mechanisms, dispositions, verdict, verified surfaces) and archives
its full finding set to `.kstack/archive/` — the queryable index over units.
Larger artifacts (PRD/ADR/ops) come from the kstack `templates/` on demand —
see the plugin's `skills/loop/references/artifacts.md` for when each earns
its file.

## Machine constraints

Facts the code does not show — append the next one the first time it bites:

- <e.g. "the deploy target pins Python 3.11; the dev venv runs 3.13">
- <e.g. "X mutates process-global state — no thread-level parallelism">

## Tests

Follow the testing doctrine in the kstack plugin
(`skills/loop/references/testing.md`): tests verify behavior at the public
surface, regression tests are proven to fail on unfixed code, and the AI failure
modes listed there are checked before a test counts.

## Merging

Merging is the owner's act. The agent opens the PR and stops; `/kstack:land`
reports merge-readiness. <State deploy implications — e.g. "main deploys via
Railway" — here.>

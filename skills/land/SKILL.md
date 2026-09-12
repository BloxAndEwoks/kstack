---
name: land
description: Check a PR's merge readiness — checks green, findings disposed, verdict posted — then hand off to the owner. Never merges autonomously.
---

# Land — merge-readiness, then the owner's act

## The gate — report each, do not fudge

1. **Checks green.** `gh pr checks` — every check `pass` or explained (a cancelled
   self-hosted job is infrastructure, not a verdict; it gets a re-run, not a pass).
2. **Findings disposed.** Zero `pending` in the review store
   (`review_state` or `.kstack/review/<pr>.json`). Deferred findings carry named
   triggers in the PR's Notes section.
3. **Verdict posted.** The independent review pass (`/kstack:review`) has posted
   PASS / PASS+NOTES / FAIL on the PR. A FAIL does not land — it goes back to
   `review-loop`.
4. **The diff is the unit.** `git log <base>..HEAD` contains only this unit's
   commits; `gh pr view` shows the right base.
5. **The record is written.** `ledger_append` — one row to the committed
   `.kstack/ledger.jsonl` (findings, mechanisms, dispositions, verdict, verified
   surfaces) plus the full findings snapshot to `.kstack/archive/<key>.json`,
   committed with the unit's final commit. This is what outlives the merged PR:
   the queryable index over every unit the repo has landed. No ledger row means
   the unit lands without a durable record — don't skip it.

## The handoff

Report: PR link, the four gate items with their real outcomes, and what the owner
should know before merging (deploy implications, ordered stack position, deferred
triggers). Then **stop**.

Merging is the owner's act. Where the repo's own rules explicitly delegate the merge
to the agent (a merge queue, a documented auto-merge convention), `gh pr merge` —
or the stacked `merge-async` endpoint for stacked PRs:

```bash
gh api -X PUT repos/{o}/{r}/pulls/{n}/merge-async -f merge_method=merge
# poll: gh api repos/{o}/{r}/pulls/{n}/merge-async/{uuid}
```

On stacked PRs, merge-async merges the stack bottom-up to the requested PR; land
only the contiguous verified run.

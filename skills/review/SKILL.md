---
name: review
description: Run the independent non-author review pass over the unit's diff — normalized findings plus a verdict. Use before open-pr, again on each fix delta, or on 'review this'.
---

# Review — the independent pass

The verifier property this buys is **independence from the build**: a reviewer that
did not write the code samples what the author structurally cannot — the assumption
the author never knew they were making.

## Inputs

- The diff range: `BASE..HEAD` for the unit (or `main...HEAD` on the PR branch).
- The repo's own review rules: `AGENTS.md`, `REVIEW.md`, `CONTRIBUTING.md` — read
  them first; they set `based_on_repo_rules` on every finding they produce.
- The finding schema: `references/finding-schema.md` under `review-loop`.

## When

Round one runs **before `open-pr`**, so external reviewers see the settled shape,
not a version about to be redesigned. There is no PR yet: findings go to the store
only, and `open-pr` renders them into the PR body with `review_summary`.

## Procedure

1. **Enumerate the diff.** `git diff <base>...HEAD --stat`, then the full diff.
2. **Review per file against the surrounding code**, in the order the reviewer
   profile sets — defects, then the target shape, then each defect's remedy — on
   the Devin Review rubric plus `simplify`:
   - **Bugs** — correctness, edge cases, regressions, missing error handling.
     Severity `severe` when the defect is reachable and wrong today;
     `non-severe` otherwise. Attach `confidence`.
   - **Security** — the CWE categories: injection, broken auth/access control,
     secrets exposure, SSRF/path traversal, insecure deserialization, missing input
     validation. Every security finding carries a `cwe` where one applies and a
     reachable-path argument, not a pattern match.
   - **Flags** — `investigate` when something warrants a human look;
     `note` for informational observations that need no action.
   - **Simplify** — `required` for complexity the diff adds when a cleaner shape
     is available; `note`, with a named trigger, for debt it only passes through.
3. **Prefer few, high-signal findings.** No style nits, no comments on correct code.
   Every finding names *what* is wrong and *why it matters*, anchored to
   `path` + line range.
4. **Emit findings.** With the `kstack` MCP server: `finding_add` per finding.
   Once a PR exists, also `comment_add` to post each as an inline PR comment carrying the
   normalized marker (the wire format in
   `skills/review-loop/references/finding-schema.md`). Without it: post via
   `gh api repos/{owner}/{repo}/pulls/{n}/comments` with the same marker block,
   or append to `.kstack/review/<branch>.json`.
5. **Independence.** Where the host supports subagents, run the pass as a
   non-author subagent using the `kstack:reviewer` profile — its own context, fed
   the diff and the repo rules, never the author's self-report.
6. **Verdict.** Report `PASS`, `PASS+NOTES`, or `FAIL`:
   - `FAIL` — a `severe` bug or any security finding reachable today. `simplify`
     never fails a pass on its own.
   - `PASS+NOTES` — findings all disposed as deferred/accepted-risk with named
     triggers.
   - `PASS` — no findings.
   Before the PR, the verdict goes into the PR body via `review_summary`; after,
   post it on the PR — it outlives the chat there.

## Iterate until clean

The pass is not capped at one round — the cloud loop's shape is review → fix →
re-review → resolved. After `review-loop` disposes the findings and the fixes
push, run the pass again. The bound is `review_state` reporting zero `pending` —
never a count of rounds. What stays bounded is *scope*: round one reviews
`BASE..HEAD`; every later round reviews only the fix delta (see the reviewer
profile's round-scope rule), so review converges instead of spiralling.

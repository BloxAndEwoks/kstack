---
name: review
description: Run the independent review pass over the unit's diff — the local equivalent of Devin Review. Emits normalized findings (bug / security / flag with severities) into the review store and, where the host allows, a non-author reviewer subagent. Use after open-pr, on any "review this", and before land.
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

## Procedure

1. **Enumerate the diff.** `git diff <base>...HEAD --stat`, then the full diff.
2. **Review per file against the surrounding code**, on the Devin Review rubric:
   - **Bugs** — correctness, edge cases, regressions, missing error handling.
     Severity `severe` when the defect is reachable and wrong today;
     `non-severe` otherwise. Attach `confidence`.
   - **Security** — the CWE categories: injection, broken auth/access control,
     secrets exposure, SSRF/path traversal, insecure deserialization, missing input
     validation. Every security finding carries a `cwe` where one applies and a
     reachable-path argument, not a pattern match.
   - **Flags** — `investigate` when something warrants a human look;
     `note` for informational observations that need no action.
3. **Prefer few, high-signal findings.** No style nits, no comments on correct code.
   Every finding names *what* is wrong and *why it matters*, anchored to
   `path` + line range.
4. **Emit findings.** With the `kstack` MCP server: `finding_add` per finding.
   Without it: append to `.kstack/review/<branch>.json` per the schema, or — on a
   real PR — post inline comments via
   `gh api repos/{owner}/{repo}/pulls/{n}/comments` with the normalized marker
   block (see `references/finding-schema.md` for the wire format).
5. **Independence.** Where the host supports subagents, run the pass as a
   non-author subagent using the `kstack:reviewer` profile — its own context, fed
   the diff and the repo rules, never the author's self-report.
6. **Verdict.** Report `PASS`, `PASS+NOTES`, or `FAIL`:
   - `FAIL` — a `severe` bug or any security finding reachable today.
   - `PASS+NOTES` — findings all disposed as deferred/accepted-risk with named
     triggers.
   - `PASS` — no findings.
   Post the verdict on the PR when one exists; it outlives the chat there.

One pass. The reviewer's job is findings, not meetings — iteration on findings
happens in `/kstack:review-loop`.

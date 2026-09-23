---
name: open-pr
description: Open a pull request for the unit's branch once it is built, verified and through its first review round. Supports drafts.
---

# Open a PR

The PR is the record of the unit — it outlives the chat. Write it for a reviewer
who was not in the session.

## Procedure

1. **Hygiene first.** The unit's `/kstack:verify-contract` pass already ran the floor
   (checks + the surface drive). If it hasn't run yet — run it now. Re-run the
   check suite only if the head moved since the last verify; do not duplicate
   the drive.
2. **Review first.** Round one of `/kstack:review` runs before the PR, and
   `review-loop` settles its findings, so external reviewers see the final shape.
3. **Commit everything.** Uncommitted changes go through `/kstack:commit` first.
4. **Read the whole diff.** `git log <base>..HEAD --oneline` and `git diff
   <base>...HEAD` — where `<base>` is the unit's BASE, not the branch point GitHub
   guesses. If the diff contains anything you did not intend, it does not ship.
5. **Title.** Short, area-prefixed, follows the repo's recent PR titles (`git log`
   on merge commits shows the convention).
6. **Body contract:**
   ```markdown
   ## Summary
   <what changed and why — the decision-level story, not the file list>

   ## Verification
   <each check: the real path exercised and its outcome, not just command names>

   ## Review
   <review_summary output — the pre-PR review's findings, dispositions, SHAs
   and triggers, rendered from the store>

   ## Notes
   <known gaps not already in Review — omit if none>
   ```
7. **Create.** Prefer the host's GitHub tooling when it exists (a GitHub MCP server),
   otherwise:
   ```bash
   git push -u origin HEAD
   gh pr create --base <base> --title "<title>" --body-file <body>
   ```
   Draft when the unit is real but not review-ready: `gh pr create --draft`.
8. **Report** the PR URL. External review comments now go through
   `/kstack:review-loop`, judged against the fix delta.

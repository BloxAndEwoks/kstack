---
name: open-pr
description: Open a pull request for the current unit's branch. Use when a unit's work is built and verified and it is time to make it the record. Covers draft PRs via --draft.
---

# Open a PR

The PR is the record of the unit — it outlives the chat. Write it for a reviewer
who was not in the session.

## Procedure

1. **Hygiene first.** The unit's `/kstack:verify` pass already ran the floor
   (checks + the surface drive). If it hasn't run yet — run it now. Re-run the
   check suite only if the head moved since the last verify; do not duplicate
   the drive.
2. **Commit everything.** Uncommitted changes go through `/kstack:commit` first.
3. **Read the whole diff.** `git log <base>..HEAD --oneline` and `git diff
   <base>...HEAD` — where `<base>` is the unit's BASE, not the branch point GitHub
   guesses. If the diff contains anything you did not intend, it does not ship.
4. **Title.** Short, area-prefixed, follows the repo's recent PR titles (`git log`
   on merge commits shows the convention).
5. **Body contract:**
   ```markdown
   ## Summary
   <what changed and why — the decision-level story, not the file list>

   ## Verification
   <each check: the real path exercised and its outcome, not just command names>

   ## Notes
   <known gaps, deferred items with named triggers — omit if none>
   ```
6. **Create.** Prefer the host's GitHub tooling when it exists (a GitHub MCP server),
   otherwise:
   ```bash
   git push -u origin HEAD
   gh pr create --base <base> --title "<title>" --body-file <body>
   ```
   Draft when the unit is real but not review-ready: `gh pr create --draft`.
7. **Report** the PR URL. If the loop expects an independent review pass, that is
   `/kstack:review` — it runs now.

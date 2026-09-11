---
name: update-pr
description: Push new work to an existing PR — pull incoming changes, re-run hygiene, commit, update title/description if the PR's scope moved.
---

# Update a PR

1. **Incoming changes.** Check whether the PR branch on the remote has commits the
   local branch lacks (reviewer fixes, another session, a web edit):
   ```bash
   git fetch origin
   git rev-list --left-right --count HEAD...@{u}
   ```
   Behind → pull and resolve; conflicts preserve the intent of both sides.
2. **Hygiene.** Re-run the repo's checks on the new state.
3. **Commit** outstanding changes via `/kstack:commit`.
4. **Push.** `git push`. Never force-push without explicit approval — if a rebase
   rewrote history and the push is rejected, stop and ask.
5. **Sync the description.** If the PR's scope moved materially, update title and
   body via `gh pr edit`. The Verification section reflects the newest head.
6. **Report** what changed and the PR URL.

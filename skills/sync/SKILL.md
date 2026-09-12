---
name: sync
description: Sync the current branch with its upstream, or publish it to a remote. Use on "sync this branch", "pull latest", "publish", "set upstream".
---

# Sync

## The nevers

- Never force-push (`--force`, `--force-with-lease`) without explicit approval.
- Never skip pre-push hooks (`--no-verify`).
- Never rewrite or drop commits during a rebase without asking.

## Procedure

1. **Commit first.** Uncommitted changes go through `/kstack:commit` — never
   rebase or push a dirty tree.
2. **Upstream exists?** `git rev-parse --abbrev-ref @{u}` tells you.
3. **With upstream:**
   ```bash
   git fetch <remote>
   git rev-list --left-right --count HEAD...@{u}
   ```
   - 0 ahead / 0 behind → report in-sync, stop.
   - Behind → `git rebase @{u}`. Conflicts: resolve preserving both sides' intent,
     `git add`, `git rebase --continue`. Unclear resolution → ask. User wants out →
     `git rebase --abort`.
   - Ahead → `git push` after a clean rebase. Push rejected because history moved →
     explain and ask before any force-push.
4. **No upstream:** pick the remote (the only remote wins; several → ask which),
   then `git push -u <remote> HEAD`.

## Validate

```bash
git status --porcelain                            # clean
git rev-list --left-right --count HEAD...@{u}     # 0  0
git rev-parse --abbrev-ref --symbolic-full-name @{u}   # upstream set
```

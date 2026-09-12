---
name: commit
description: Commit staged or unstaged changes with a message that matches the repository's existing commit style. Use when asked to commit, check in, or save work.
---

# Commit

## The nevers

- Never amend, force-push, or push without explicit approval.
- Never skip hooks (`--no-verify`) or signing (`--no-gpg-sign`).
- Never revert, reset, or discard user changes unless explicitly asked.
- Check the diff for secrets and generated artifacts before staging. If something
  looks risky — ask.

## Procedure

1. **Learn the convention.** Sample the repo and the author:
   ```bash
   git log --oneline -20
   git log --oneline --author="$(git config user.name)" -10
   ```
   Detect the convention (conventional commits, ticket-prefixed, free-form) and
   follow it. Intent over file inventory.
2. **Check status.** `git status --short`. Nothing to commit → say so and stop.
   Staged changes → commit those only. Unstaged only → `git add -A` (respecting the
   secrets check above).
3. **Draft from the diff.** `git diff --cached`. Subject ≤ 72 chars in the repo's
   style; a body only when the change is non-trivial, explaining *why*.
4. **Commit** — `git commit -m "<subject>" -m "<body>"`.
5. **Confirm.** `git status --short` + `git log --oneline -1`. If hooks modified
   files or failed, report exactly what happened — do not amend silently; stage and
   re-commit the hook's changes only after telling the user.

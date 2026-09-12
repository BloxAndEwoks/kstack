---
name: sync-upstream
description: Rebase a stale session branch onto the latest upstream. Use when the base branch has moved significantly and the unit must catch up — upstream wins every conflict; session work adapts to fit.
---

# Sync upstream

Rebase the unit's branch onto the latest upstream so the work stays grounded in
what main actually is now.

## Procedure

1. Commit outstanding changes via `/kstack:commit` — never rebase a dirty tree.
2. ```bash
   git fetch origin
   git rebase origin/<base>          # main unless the unit's base says otherwise
   ```

## Conflict rule — upstream always wins

- **Never alter upstream logic, APIs, or patterns** to accommodate session work.
- **Adapt the unit's work** to fit the new upstream — rename, restructure, rewrite
  as needed while preserving the unit's goal.
- After each resolution: `git add <files>`, `git rebase --continue`.
- If the upstream change invalidated the unit's premise, stop and say so — a revised
  approach is a finding, not a failure.

## Validate

Verify the result still builds and the unit's intent survives: run the repo's
checks, and re-drive the unit's changed behavior if it touched a shipped surface.
Report what upstream moved and what the unit had to become to fit.

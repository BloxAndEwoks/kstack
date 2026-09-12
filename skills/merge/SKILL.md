---
name: merge
description: Merge a unit's topic branch into its base branch locally — the worktree-level merge. For landing a PR on the remote, use land. Use on "merge this into main locally", "bring the work back".
---

# Merge (local)

Merge the topic branch into its base. For a worktree unit, the base branch is
checked out in the main worktree — merge there without leaving this one.

## The nevers

- Never force-push, skip hooks, or rewrite/drop commits without asking.
- When in doubt on a conflict — ask. `git merge --abort` is always available.

## Procedure

1. **Commit outstanding changes** via `/kstack:commit`.
2. **Merge** — from a worktree, target the base's checkout:
   ```bash
   git -C <main-worktree-path> merge <topic-branch>
   ```
3. **Conflicts:**
   ```bash
   git -C <main-worktree-path> diff --name-only --diff-filter=U
   ```
   Resolve each file preserving the intent of both sides, `git -C <main-worktree>
   add <file>`, then `git -C <main-worktree> commit --no-edit`.

## Validate

```bash
git -C <main-worktree-path> status --porcelain                       # clean
git -C <main-worktree-path> merge-base --is-ancestor <topic> HEAD    # all commits in
```

For landing a PR remotely — checks, findings, owner merge — that is `/kstack:land`.

# Playbook: stack

An ordered set of dependent units landing as a PR stack — each PR's base is the PR
below it.

## Building the stack

1. **Order before building.** Name each unit and its position. Each unit is one named
   goal; the stack's value is that each PR reviews independently.
2. **Branch chain.** `unit-1` off main, `unit-2` off `unit-1`, and so on. Each unit
   runs its own playbook's steps on its own branch.
3. **Review, then open bottom-up.** Each unit takes its first `review` round
   before its PR opens. `open-pr` on unit 1 (base `main`), then unit 2 (base unit-1's
   branch), and so on — each PR's diff shows only its own increment.
4. **Review per PR.** `review-loop` on each PR's comments, judged against the fix delta. A finding on unit N that
   rewrites unit N-1's ground goes back down the stack — fix the layer that owns it,
   not the layer that trips on it.

## Landing the stack

Landing is strictly bottom-up. On hosts with stacked-PR support (GitHub's native
stacks, Graphite), the platform retargets each PR as its base merges. Without it:

1. Merge the bottom PR (or hand it to the owner — the merge is the owner's act).
2. Retarget the next PR's base to the trunk (`gh pr edit <n> --base main`).
3. Watch for conflicts at each retarget: `git merge-tree --write-tree origin/main
   <branch>` predicts them before the merge attempt.
4. Repeat. Only the contiguous verified run lands — a PR mid-stack with open findings
   stops the run, it does not get skipped.

**Reply:** the stack map (unit → PR → verdict), what landed, what is still open.

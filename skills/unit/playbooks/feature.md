# Playbook: feature

New or changed behavior. The unit answers one named goal; a task with two goals is
two units.

1. **Scope.** Read the repo's procedure file and the code the task touches. For
   work on a shipped surface, run `/kstack:verify-contract`'s first seat — a live look at
   current behavior — before designing. Name the
   data shape before writing logic — state machine over scattered booleans, table or
   registry over branching, typed model over repeated shape assumptions. If a design
   fork is genuinely empirical (behavior, timing, output you could observe), settle
   it with a throwaway probe rather than asking the user.
2. **Test first where the repo has tests.** A failing test that names the behavior,
   then the implementation — per `../references/testing.md`. Behavior-level
   assertions via public APIs; every new test must be able to name the diff that
   would fail it.
3. **Build in commits.** One commit per coherent checkpoint. Reversible steps can
   proceed without asking; pause on irreversible writes.
4. **Verify via `/kstack:verify-contract`.** The check suite is the floor; the seat is
   driving the changed behavior on the real surface — the app, the CLI, the
   endpoint — not a proxy.
5. **`/kstack:open-pr`** — write the PR against BASE.
6. **`/kstack:review`** — the independent pass over `BASE..HEAD`.
7. **`/kstack:review-loop`** — normalize and dispose every finding the PR collects.
8. **`/kstack:fix-ci`** on any failed check.
9. **`/kstack:land`** — report merge-readiness; the owner merges.

**Reply:** what was built, what was chosen and why, open decisions. The PR link.

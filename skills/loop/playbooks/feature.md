# Playbook: feature

New or changed behavior. The unit answers one named goal; a task with two goals is
two units.

1. **Scope.** Read the repo's procedure file and the code the task touches. Name the
   data shape before writing logic — state machine over scattered booleans, table or
   registry over branching, typed model over repeated shape assumptions. If a design
   fork is genuinely empirical (behavior, timing, output you could observe), settle
   it with a throwaway probe rather than asking the user.
2. **Test first where the repo has tests.** A failing test that names the behavior,
   then the implementation. Behavior-level assertions via public APIs; no
   tautological tests that pin internals.
3. **Build in commits.** One commit per coherent checkpoint. Reversible steps can
   proceed without asking; pause on irreversible writes.
4. **Verify on the real surface.** Run the repo's own checks (lint, typecheck, tests),
   then drive the changed behavior the way its consumer meets it — the app, the CLI,
   the endpoint — not a proxy. If the repo ships a `verify-*` skill, use it. "It
   compiles" and "tests pass" are the floor, not the verification.
5. **`/kstack:open-pr`** — write the PR against BASE.
6. **`/kstack:review`** — the independent pass over `BASE..HEAD`.
7. **`/kstack:review-loop`** — normalize and dispose every finding the PR collects.
8. **`/kstack:fix-ci`** on any failed check.
9. **`/kstack:land`** — report merge-readiness; the owner merges.

**Reply:** what was built, what was chosen and why, open decisions. The PR link.

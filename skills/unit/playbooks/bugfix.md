# Playbook: bugfix

A reported or observed defect. The deliverable is a fix with evidence the defect is
gone — not a plausible-looking diff.

1. **Reproduce first.** On the real surface where the bug lives — running app, CLI,
   endpoint. A bug you cannot reproduce is an investigation, not a fix; say so and
   route to `investigate.md` if reproduction fails. Hand to the user only when the
   surface genuinely cannot be driven locally (production-only state, third-party
   side effects).
2. **Root cause, not symptom.** Trace the symptom to the mechanism that produces it.
   The regression test goes at the mechanism level — it fails on the old code and
   passes on the fix.
3. **Fix minimally.** The smallest change that removes the mechanism. If the root
   cause is structural and the task is bigger than the fix, surface that — a real
   finding beats a buried one.
4. **Regression test.** Written before or with the fix, at the public surface —
   and proven to fail on the unfixed code. Per `../references/testing.md`.
5. **Verify via `/kstack:verify-contract`.** The check suite plus re-driving the
   reproduction path on the real surface — the bug is fixed when the surface says
   so.
6. **`/kstack:review`** → **`/kstack:review-loop`** → **`/kstack:open-pr`** →
   **`/kstack:review-loop`** →
   **`/kstack:fix-ci`** as needed → **`/kstack:land`**.

**Reply:** the reproduction path, the mechanism, the fix, the evidence.

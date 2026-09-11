# Playbook: perf

Measured slowness to trace and improve. The deliverable is a delta against a named
baseline, with the measurement attached.

1. **Baseline first.** A reproducible measurement of the current behavior — command,
   workload, numbers. No baseline, no perf work: you cannot prove an improvement you
   never measured.
2. **Trace, don't guess.** Find where the time actually goes before optimizing —
   profile, instrument, or bisect. The change goes where the measurement points.
3. **One change per measurement.** Change one thing, re-measure. Multiple changes in
   one step means no attribution.
4. **Keep the evidence.** The before/after numbers go in the commit message or the
   PR Verification section. A perf claim without numbers is a story.
5. **Regression guard.** If the repo has a perf-sensitive path, the test or benchmark
   that would catch a regression ships with the change.
6. **`/kstack:open-pr`** → **`/kstack:review`** → **`/kstack:review-loop`** →
   **`/kstack:fix-ci`** as needed → **`/kstack:land`**.

**Reply:** baseline, mechanism found, delta measured, the numbers.

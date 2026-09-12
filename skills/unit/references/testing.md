# Testing doctrine

Cited by every playbook's test step, by the reviewer's test-quality check, and by
the repo `AGENTS.md` template. The repo's own test rules outrank this file where
they exist.

## What a test is for

A test verifies a business requirement or observable behavior — never pins
implementation details. The unit of truth is the public surface: the API, the
rendered output, the state transition, the emitted record.

- Test-first for bug fixes and new behavior. The regression test is written
  against the mechanism and **proven to fail** on the unfixed code — a test that
  was never observed failing proves nothing.
- Test the underlying principle, not one edge case. Prefer invariants and
  property-style checks where the domain fits; for a state machine, a randomized
  model-vs-implementation walk beats hand-picked examples.
- Given-When-Then structure where it clarifies the scenario.

## The AI failure modes — what to check before a test counts

These are the shapes agent-generated tests most often take when they look fine
and aren't:

1. **Mirror tests** — the test computes its expectation with the same logic as
   the implementation, so it cannot fail. Expected values come from the spec or
   the observed requirement, never re-derived from the code under test.
2. **Mock-overfitting** — so much is mocked that the test verifies the mock, not
   the system. A test asserting "mock was called with X" instead of an outcome is
   coverage theater. Mock at boundaries (network, clock, filesystem), not at the
   seam you're testing.
3. **Vacuous assertions** — `expect(true)`, snapshots nobody reads, asserts that
   can't fire on the paths the test drives. Every test must be able to name the
   diff that would make it fail.
4. **Happy-path-only** — the error branches, boundary values, and refusal paths
   the change added are untested. If the diff adds a failure mode, the test must
   drive it.
5. **Snapshot reflex** — bulk `--update-snapshot` after a change is a masked
   regression until each changed snapshot is reviewed line by line.
6. **Isolation leaks** — tests that pass only in suite order, share mutable
   state, or leave rows/files behind. Each test stands alone under any ordering
   and any parallelism.
7. **Flakiness normalized** — retries, `sleep()`, timing races patched over
   instead of fixed. Flaky is a defect in the test or the code, not a property to
   manage. Seeded RNG, fake clocks, no live network, no wall-clock sleeps.
8. **Dead and decayed tests** — accumulated skips/xfails without named reasons,
   tests asserting behavior the code no longer has. A skip needs a reason and a
   named trigger, same rule as a deferred finding.
9. **Green-suite false confidence** — the suite passes while the changed path
   has no coverage. Coverage is a signal for where to look, never the evidence
   the change works. The drive on the real surface is the evidence.

## Suite health — performance applies to tests too

- **Fast**: the suite is the loop's clock — slow suites get skipped, and skipped
  verification is no verification. Shared factories/fixtures, minimal containers,
  no per-test app boots where a process can be reused.
- **Deterministic**: seeded RNG, fake or frozen clocks, no live network, no
  ordering dependence. Non-determinism in tests is a bug, filed as one.
- **Parallel-safe**: isolation leaks (above) are what make suites unable to
  parallelize; parallelizing a leaky suite manufactures flakes.

## Performance testing

- **Baseline before optimization** — same rule as the perf playbook: no baseline,
  no claim.
- **Assert the shape, not the stopwatch.** Absolute time assertions flake in CI.
  Prefer relative bounds (≤ 2× baseline under the same harness), operation counts
  (queries, allocations, renders), or size/throughput contracts. If wall-clock is
  measured, use warm-up runs and fixed iteration counts, and treat the number as
  a report, not a gate — the gate is the count or the ratio.
- **Regression budgets live in the test** — "this endpoint must not issue more
  than N queries" is a testable invariant; "feels faster" is not.
- **Deterministic workloads** — fixed input corpora and seeds so a delta means
  the code changed, not the input.

## Reviewer's checklist for test changes

A test addition or edit is reviewable code. The reviewer checks: proven-to-fail
for regressions, assertions that can actually fire, mocks only at boundaries, no
new skips without reasons, and whether the suite exercises the diff's failure
modes — not just its happy path.

---
name: fix-ci
description: Diagnose and fix failed CI checks on the current PR. Use when checks go red, on "get it green", or when review-loop reports check failures.
---

# Fix CI

## Procedure

1. **Collect the failures.**
   ```bash
   gh pr checks                      # which checks, which conclusion
   gh run view --log-failed          # the failing job logs
   gh api repos/{o}/{r}/commits/{sha}/check-runs   # annotations per check
   ```
   Read the actual log output — the check name alone is not a diagnosis.
2. **Classify before fixing.** Three shapes need different responses:
   - **Real failure** — the code is wrong or incomplete. Fix at the mechanism.
   - **Infrastructure flake** — runner never acquired the job, timeout, network
     fault, cancelled-by-concurrency. The fix is a re-run
     (`gh run rerun <id> --failed`), not a code change.
   - **Stale check** — the check ran against an old head. Confirm the head SHA;
     a push or re-run refreshes it.
3. **Fix the root cause** of real failures. Focused changes — no unrelated edits
   smuggled into a CI fix.
4. **Validate locally first** — run the repo's equivalent of the failing check
   before pushing. CI is the floor you already have; don't use it as the test rig.
5. **Push and watch.** `git push`, then `gh pr checks --watch` until green or the
   next real failure.
6. **Report** the root cause per check — not just "fixed", what was wrong.

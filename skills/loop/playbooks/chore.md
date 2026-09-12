# Playbook: chore

Dependencies, configuration, tooling, cleanup — work with no intended behavior change.

1. **Blast radius first.** A dependency bump or config change lists what it touches
   before it lands: dependents, deploy surfaces, lockfiles, generated files.
2. **Prefer the package manager.** `npm add`, `cargo add`, `uv add` — not hand-edited
   manifests. Prefer versions published at least a week ago; avoid floating ranges
   that resolve to unvetted releases.
3. **Behavior invariance is the test.** The suite should pass unchanged. A chore that
   needs test changes is part feature — name it.
4. **Verify via `/kstack:verify`.** The check suite, plus any surface the chore
   actually touches — a build change gets a build; a CI change gets a run.
5. **`/kstack:open-pr`** → **`/kstack:review`** → **`/kstack:review-loop`** →
   **`/kstack:fix-ci`** as needed → **`/kstack:land`**.

**Reply:** what changed, the blast radius checked, evidence nothing else moved.

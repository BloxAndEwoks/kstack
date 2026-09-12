# The kstack philosophy

kstack exists because the cloud PR loop is good and the local loop was missing —
and because the previous attempt at encoding discipline grew teeth in the wrong
place.

## Thin bookends, real middle

The cloud flow's virtue is its shape: a task enters, a merge-ready PR exits, and
an independent review stands between them. Everything valuable about it is
structural — isolation, the PR as record, a verdict that outlives the chat.

Everything dangerous about reproducing it is procedural. The predecessor of this
plugin layered a finding ledger, sufficiency walks, and mandatory delegation
between the bookends. It spiraled: each finding spawned meta-work about findings.
The lesson it proved by counterexample: **process that processes itself has no
terminator.**

So kstack keeps the bookends and deletes the meta-layer:

- **One independent review pass** per PR — never review rounds inside review
  rounds.
- **Findings get dispositions, not meetings.** Accept→fix+cite the SHA;
  refute→post evidence; defer→name the trigger; accept-risk→name the reason.
- **Learning is a write, not a walk.** `learn` captures to the repo's own files
  when something is worth keeping. No ledger to traverse, no schema of schemas.
- **The repo's rules outrank the plugin.** kstack supplies a default loop; a repo
  with stronger procedure keeps it. Rigor that a project needs lives in that
  project's files where a session will actually find it.

## The QA layer is the exception to "thin"

One part of the loop deserves real structure: review findings. Devin Review's
protocol — normalized kinds (bug/security/flag), severities per kind, confidence,
CWE, repo-rules awareness, per-thread dispositions — is the best existing answer
to "how does an agent consume automated review." kstack adopts it wholesale as the
finding schema and writes adapters for whatever bot speaks: Devin Review,
CodeRabbit, human comments, the plugin's own reviewer.

The QA layer is thick because it is *data* — a shape other things plug into.
Everything else stays thin because it is *process* — and process compounds.

## What we verify, not what we assume

The plugin was designed against the harness Devin actually ships — the twelve
session skills in the desktop bundle, the review-comment wire protocol observed
on real PRs, the documented taxonomy — not against a guess at the prompts. Where
the harness can't be forked (native tools, UI buttons, the VM), kstack substitutes
the equivalent channel: `gh` for GitHub MCP, a findings store for inline comments,
skill descriptions for buttons.

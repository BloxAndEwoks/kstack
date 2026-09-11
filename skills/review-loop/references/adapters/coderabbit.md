# Adapter: CodeRabbit and other review bots

CodeRabbit, Graphite bugbot, Copilot review, and similar tools post inline comments
without a common marker. Normalize by convention:

## CodeRabbit

- Inline comments anchor `path`/`line`/`side` directly from the GitHub comment.
- Severity markers in body text (`_⚠️ Potential issue_`, `_🛠️ Refactor suggestion_`,
  `_💡 Nitpick_`, `_🧹 Nitpick_`) map:
  - `⚠️ Potential issue` → `kind: bug`, `severity: non-severe` (upgrade to
    `severe` if it reproduces)
  - `🛠️ Refactor suggestion` → `kind: flag`, `severity: investigate`
  - `💡`/`🧹` nitpicks → `kind: flag`, `severity: note`
- Committable suggestion blocks carry `remediation` verbatim.
- The walkthrough/summary issue comment is not a finding.

## Copilot review / generic bots

- No severity vocabulary: default `kind: bug`, `severity: non-severe`,
  `confidence: medium` unless the body argues otherwise.
- Anything phrased as a question or observation → `kind: flag`, `severity:
  investigate`.

## Human comments

- `source: human`. No marker — the finding gets a synthesized `id`
  (`HUMAN_<comment-id>`). Humans outrank bots: a human finding is never auto-
  `refuted`; refuting a human takes evidence AND usually a conversation.

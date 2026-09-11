---
name: learn
description: Capture a durable repository learning when one is discovered — a recurring pattern, a non-obvious pitfall, an architectural constraint, a correction that generalizes. Use on "learn!", "remember this", or when a discovery would save future sessions real time.
---

# Learn — the capture step

One step, deliberately small: turn a discovery into a durable artifact in the repo
or the user's config. No ledger, no sufficiency walks — a learning earns its place
by being true and reusable.

## When

- The user says **learn!** or asks to capture something.
- A pattern or constraint cost real debugging time to discover.
- A user correction reveals a general rule, not a one-off preference.

## Where

In order of preference:

1. **The repo's procedure file** (`AGENTS.md` or equivalent) — for rules every
   session must know. Constraints, commands, environment facts that the code does
   not show.
2. **A repo doc** — for facts, decisions, measurements. Follow the repo's doc
   spine conventions.
3. **A repo skill** (`.devin/skills/<name>/SKILL.md`, `.github/skills/`, or
   `.agents/skills/` per host) — for a multi-step procedure worth invoking by name.
4. **User-level rules** (`~/.config/devin/` or the host's global config) — only for
   learnings that genuinely apply to every repo.

## What a good learning looks like

- **General enough** to help a future session, **specific enough** to act on.
- **Root cause, not symptom** — what was wrong and why.
- **A concrete example** of right vs wrong where one exists.
- Lands where a session will actually find it — a learning in the wrong file is a
  learning lost.

## Procedure

1. State the learning in one sentence — root cause and the rule it implies.
2. Pick the home per above; check for an existing section or file it belongs in.
3. Write it. Match the file's existing style.
4. Tell the user what was captured and where — and whether it was new content or an
   update to existing text.

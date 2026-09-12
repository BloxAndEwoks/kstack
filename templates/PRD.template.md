# PRD: <name>

**Status:** draft | active | deferred | landed
**Deferred trigger:** <if deferred — the named condition that re-opens this>

## Problem

<What consumer-visible gap or behavior this addresses. One paragraph, no
solution language.>

## Requirements

| # | Requirement | Verified by |
|---|-------------|-------------|
| R1 | <observable requirement> | <the surface/drive that proves it> |

## Non-goals

<What this unit explicitly does not do.>

## Acceptance

<The journeys a consumer can walk that prove the requirements — these become
surfaces in VERIFY.md and the Verification section of the PR.>

## Phases

<The ordered breakdown into units — one unit = one PR. Skip when the PRD is a
single unit.>

| Phase | Units (each = one PR) | Depends on |
|-------|-----------------------|------------|
| 1 | <unit slugs> | — |
| 2 | <unit slugs> | phase 1 |

Each phase's units run `/kstack:unit` in order; dependent units stack
(`/kstack:unit` → `stack` playbook).

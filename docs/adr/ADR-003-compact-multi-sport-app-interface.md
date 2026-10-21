# ADR-003: Compact Multi-Sport App Interface

## Status: Accepted (Date: 2026-10-21)

## Context

Gridiron Atlas V2.0 established a centered editorial identity for the NFL experience, but its large hero, repeated navigation, tall schedule cards, and stacked mobile sections make it difficult to see the weekly slate without substantial scrolling. A proposed dashboard-style replacement increased application chrome and split the experience into workspaces, but moved away from the focused character of V2.0.

The product is also expected to explore college football in a later release. The current application is deliberately NFL-specific: its provider functions, cache keys, environment variables, live-score integration, team metadata, calendar descriptions, and public copy all assume the NFL. Presenting a CFB switch before a real provider exists would imply unsupported functionality, while leaving presentation code entirely NFL-specific would make the later mode unnecessarily disruptive.

## Decision

- Retain V2.0 as the visual baseline: a centered, light editorial surface with a navy masthead and progressive detail pages. Do not introduce a desktop sidebar or dashboard shell.
- Make the primary experience feel app-like through a featured editorial masthead, an attached live/next-kickoff strip, compact score rows, collapsed weekly schedules, condensed standings, and persistent mobile navigation. The masthead may provide a deliberate introductory scroll while the controls and data rows remain dense.
- Use semantic sport theme tokens. NFL is the only active mode and uses red for branded interaction states. CFB is registered as a planned mode with a blue theme, but is not selectable and has no routes or data source in V2.1.
- Introduce a typed sport definition and capability model. Features such as player search, comparison, live scores, and calendar actions are declared as sport capabilities rather than assumed universally.
- Introduce a provider registry that fails closed when a sport has no registered provider. Register only the existing NFL provider in V2.1.
- Allow shared presentation components to consume neutral football aliases while retaining the existing `Nfl*` types for compatibility. Provider-specific environment variables, cache behavior, validation, and normalized live-data contracts remain unchanged.
- Preserve the current unprefixed NFL URLs. A future decision will define whether CFB uses a path prefix, a persisted mode selector, or a separate entry point.
- Restore team comparison as a compact public page backed by the existing NFL head-to-head provider integration.

## Consequences

- Positive: The application shows more useful football information per screen while retaining the V2.0 identity.
- Positive: Mobile navigation and controls behave more like an installed sports application without converting Astro pages into a client-side SPA.
- Positive: NFL and future CFB branding can diverge without duplicating the global design system.
- Positive: Unsupported sport capabilities can be hidden explicitly instead of failing at runtime.
- Negative: The sport and provider abstractions precede the second provider and therefore require maintenance before their full value is realized.
- Negative: Some NFL-specific types remain as compatibility names until a real CFB adapter proves the common normalized model.
- Negative: Fixed mobile navigation requires safe-area spacing and additional responsive regression coverage.

## Deferred CFB Decisions

- Public routing and mode persistence.
- The authoritative schedule, team, conference, ranking, roster, and live-score providers.
- Ranking and postseason presentation, including polls, conference championships, bowls, and the playoff.
- Whether player search, historical comparison, calendars, and live box scores are available in the initial CFB release.
- Cache cadence, provider quotas, failure behavior, and observability for CFB data.


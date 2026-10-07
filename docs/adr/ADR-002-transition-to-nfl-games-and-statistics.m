# ADR-002: Transition from Blog to NFL Games and Statistics Website
## Status: Accepted (Date: 2026-10-07)
## Context
The project is currently an Astro blog, but the intended product is an accessible NFL games and statistics website. The site should help visitors quickly see what is happening this week and then browse to detailed game, team, player, standings, and comparison information without overwhelming them with statistics up front.

The application needs current and historical NFL data. Calling an external provider from every visitor's browser would multiply requests, expose the site to provider availability and rate limits, and make the data source difficult to change. Live scores have different freshness needs from historical and season statistics. The `nfl-data-api` is the selected starting source for schedules, completed games, and statistics. ESPN's public-facing endpoints may be investigated for live game data, but they are not treated as a stable or supported API.

ADR-001 already selects Astro with the Node adapter in standalone mode and a container runtime. This decision builds on that server-rendered deployment.
## Decision
- Reorient the website from a blog into an NFL games and statistics explorer, retaining Astro SSR and the containerized Node runtime.
- Use `nfl-data-api` as the initial provider for schedules, completed games, historical data, standings, and statistics. Keep provider-specific requests and response mapping behind a server-side data-source boundary so providers can be replaced without coupling page components to their schemas.
- Fetch and validate provider data on the server, transform it into application-facing data, and persist or cache it for Astro pages to read. Start with a scheduled daily refresh for non-live data; make refresh frequency configurable as requirements and provider limits are confirmed.
- Treat live scores as an optional, separate data path. Investigate ESPN's public endpoints for this purpose, isolate them behind the same server-side boundary, and enable them only after their availability, usage constraints, and data quality have been verified. Do not make browsers call the external live feed directly. When enabled, refresh and cache live data server-side only while games are in progress, at a provider-compatible interval.
- Design the interface for progressive detail: show a compact weekly overview first, then provide dedicated game, team, and player pages for deeper statistics. Make standings easy to browse; add comparisons where the available data supports them. Clearly label live status and data freshness.
## Consequences
- Positive: The product has a clear NFL focus and supports both quick browsing and deeper exploration.
- Positive: Server-side caching limits duplicate provider requests, reduces dependence on upstream availability during page views, and provides a practical data-ingestion and operations workflow.
- Positive: A provider boundary allows the historical/statistical source and any live-data source to evolve independently.
- Negative: Ingestion, validation, persistence, cache freshness, and error handling add operational complexity beyond a static blog.
- Negative: The community-maintained primary API and any undocumented live endpoint may change, become unavailable, or have data gaps. Live scores must not be presented as guaranteed real time.
- Negative: A daily refresh is not appropriate for live scores; the optional live path requires a separate refresh policy and additional monitoring.

If an upstream refresh fails, continue serving the last successfully stored data when available and show its update time. Do not silently present stale data as current. Before enabling a live provider, verify its terms, rate limits, endpoint behavior, and whether its use is appropriate for the project.
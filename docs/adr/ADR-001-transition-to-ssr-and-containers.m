# ADR-001: Transition from Static Site to Containerized SSR Runtime
## Status: Accepted (Date: 2026-10-05)
## Context
Our platform requires dynamic API endpoints (/api/health, /api/feedback).
Static hosting on S3 cannot execute server-side Node.js code.
## Decision
We will configure Astro with the `@astrojs/node` adapter in standalone mode
and package the application as a Docker container.
## Consequences
- Positive: Enables live API routes, dynamic rendering, and operational health checks.
- Negative: Increases operational complexity; requires container compute runtime.
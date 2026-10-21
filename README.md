# Gridiron Atlas

Gridiron Atlas is a server-rendered NFL dashboard for following the schedule, scores, teams, players, and games from one place.

Explore upcoming and completed games, check standings and team records, search player profiles and season stats, compare teams, and open detailed game pages. During games, live updates bring scores, game state, recent plays, and available stats into the dashboard. Live information is best effort and may be delayed or unavailable when an upstream provider is unavailable.

## What you can do

- Browse the schedule, filter games by week or team, and open game details.
- Follow available live scores, game status, recent plays, possession, and team or player stats.
- Find teams, standings, player profiles, and season statistics.
- Explore historical head-to-head matchups.
- See kickoff times in your local timezone and use keyboard-friendly controls for interactive game cards.

## How it works

The application is built with **Astro** using server-side rendering and the Node standalone adapter. Pages and same-origin API routes run on the server, so provider requests and data normalization stay out of the browser.

| Data | Source | Notes |
| --- | --- | --- |
| Schedules, teams, players, season stats, and historical matchups | [NFL Data API](https://api.nfldata.org/docs) | Validated on the server before use. |
| Live scores, game state, plays, and available game summaries | ESPN public scoreboard and summary endpoints | Best effort; freshness and availability are not guaranteed. |
| Some missing historical final scores | ESPN public scoreboard | Best-effort fallback. |
| Standings and team records | Derived from completed games | Not inferred from scheduled games. |

Provider results are cached in memory and on disk under `NFL_DATA_DIR/api-cache` (default: `.data/api-cache`). Concurrent requests are coalesced where applicable. When an upstream source is unavailable, saved data may be served with a stale-data indication rather than presented as current.

The interface uses Astro components and Motion for restrained UI animations, with reduced-motion support. Team marks and player avatars are original, text-based SVGs rather than downloaded NFL logos or player photos.

## Technology

- Astro 7, TypeScript, and the Astro Node standalone adapter
- Motion for interface animations
- Vitest for unit tests and Playwright for browser tests
- Docker multi-stage image running as a non-root user
- AWS CDK for deployment infrastructure
- Node.js 22.12 or newer

## Run locally

```sh
npm ci
npm run dev
```

The site runs at <http://localhost:4321>. Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run check` | Astro and TypeScript checks |
| `npm run lint` | ESLint |
| `npm run test:unit` | Unit tests |
| `npm run test:e2e` | Playwright browser tests |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |

Playwright uses local NFL and ESPN fixtures so browser tests do not depend on external providers.

## Run with Docker

The production image builds the site in separate stages, installs only production dependencies in the runtime image, and runs as the unprivileged `node` user. The `/app/data` volume preserves the server-side API cache across container replacements.

```sh
docker build -t gridiron-atlas .
docker run --detach --name gridiron-atlas \
  --publish 4321:4321 \
  --volume gridiron-atlas-data:/app/data \
  gridiron-atlas
```

Check the service at <http://localhost:4321>. The container health check uses `/api/health`; the load balancer readiness endpoint is `/api/ready`.

## Deployment

AWS CDK defines two independent deployments:

| Site | Infrastructure | GitHub environment | Workflow |
| --- | --- | --- | --- |
| SSR dashboard | ECS Fargate behind an Application Load Balancer (`CdkStack`, implemented by `cdk/lib/ssr-site-stack.ts`) | `production-ssr` | `deploy-container.yml` |
| Static release | Private S3 bucket behind CloudFront (`StaticSiteStack`) | `production-static` | `deploy-static.yml` |

The SSR workflow deploys the current `main` application. The static workflow builds the immutable `1.0.0` release separately. Both workflows deploy after successful CI on `main` and can also be manually dispatched from `main`; successful deployments are recorded in GitHub under their environments.

To work with the CDK application locally, install dependencies in `cdk/` and run:

```sh
cd cdk
npm ci
npm test
npm run build
npx cdk synth
```

Deployments require AWS credentials and a CDK-bootstrapped account. See [`cdk/README.md`](cdk/README.md) for deployment details and prerequisites.

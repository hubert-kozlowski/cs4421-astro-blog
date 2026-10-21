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
| Static blog | Private S3 bucket behind CloudFront (`StaticSiteStack`), published from the immutable `1.0.0` tag | `production-static` | `deploy-static.yml` |

The SSR workflow deploys the current `main` application. The static workflow builds the immutable `1.0.0` release separately. Both workflows deploy after successful CI on `main` and can also be manually dispatched from `main`; successful deployments are recorded in GitHub under their environments. Deployments require AWS credentials and a CDK-bootstrapped account. See [`cdk/README.md`](cdk/README.md) for deployment details and prerequisites.

### Container operations

```sh
curl http://localhost:4321/api/health
docker ps
docker inspect --format='{{.State.Health.Status}}' gridiron-atlas
docker logs gridiron-atlas
```

In OrbStack, the same running container and image are also visible in its Containers and Images views. You can inspect container status and logs there; the CLI commands above work with both OrbStack and Docker Desktop.

Stop and remove a container when finished. Removing the container does not remove the named data volume:

```sh
docker stop gridiron-atlas
docker rm gridiron-atlas
```

To use a different host port if `4321` is already occupied, change the left side of the mapping (for example, `-p 4322:4321`) and visit <http://localhost:4322>.

The container sets `NFL_DATA_DIR=/app/data`; API responses persist in the mounted data volume, so the last saved schedule/profile can still be served when the provider is unavailable.

### Push to Amazon ECR

Authenticate, tag, and push the cloud-compatible image to the project's ECR repository in `us-east-1`:

```sh
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 782086108883.dkr.ecr.us-east-1.amazonaws.com

docker tag astro-blog:v1.0.0 782086108883.dkr.ecr.us-east-1.amazonaws.com/astro-blog:v1.0.0
docker push 782086108883.dkr.ecr.us-east-1.amazonaws.com/astro-blog:v1.0.0
```

AWS CLI credentials need permission to authenticate and push to the ECR repository. The repository has immutable tags, so choose a new version tag for each published image.

`deploy-static.yml` checks out and builds the immutable `1.0.0` tag before deploying `StaticSiteStack`; `deploy-container.yml` deploys the current `main` SSR application through `CdkStack`.

To work with the CDK application locally, install dependencies in `cdk/` and run:

```sh
cd cdk
npm ci
npm test
npm run build
npx cdk synth
```

## Metrics & observability

- `/metrics` (and `/api/metrics.json`) shows 7-day API requests, error rate, latency, CPU, RAM and storage with week-over-week trends. Protected by HTTP Basic auth; the password is `METRICS_PASSWORD` (defaults to `password` — override in production).
- With `ALB_DIMENSION`, `ECS_CLUSTER`, `ECS_SERVICE` (set by the CDK stack) data comes from CloudWatch; otherwise from in-process counters.
- Every request emits one JSON log line (`event: "http_request"`, `level`, `status`, `durationMs`, `requestId`). The CDK stack adds a metric filter on `level=error`, alarms (CPU, memory, 5xx, error logs) and a CloudWatch dashboard.

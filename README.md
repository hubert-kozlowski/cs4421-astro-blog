# Gridiron Atlas

Gridiron Atlas is a server-rendered NFL dashboard that brings the full schedule, scores, team records, player search, and historic matchups together in one clear view.

Use the in-page shortcuts to jump to what you need, filter games by week or team, and open any team, game, or player for more detail. A live countdown highlights the next shared kickoff window; completed games at the same kickoff are ordered by underdog upset size when spread data is available. Conference, position, game status, and stat colors make the data easier to scan.

> **Project status:** The dashboard uses the server-side NFL Data API for schedules, team metadata, player search and profiles, season stats, and historical head-to-head results. ESPN's public scoreboard and summary endpoints supply best-effort live game updates.

## Data providers

The provider client validates API response shapes and keeps upstream requests on the Astro server. Results are cached in memory and under `NFL_DATA_DIR/api-cache` (local default: `.data/api-cache`); a saved response is served with a stale-data label if the provider becomes unavailable. Player profiles request season aggregates once per player, display the current-season line when available, and otherwise show that player's most recent regular-season line.

| Use | Provider | Status |
| --- | --- | --- |
| Schedules, game details, team metadata, players, season stats, and head-to-head | [NFL Data API](https://api.nfldata.org/docs), backed by nflverse data | Integrated for server-side page rendering. |
| Standings | Derived from completed regular-season games returned by the NFL Data API | Only calculated when final scores are available; no standings are inferred from scheduled games. |
| Final scores missing from older games | ESPN public scoreboard endpoint | Best-effort server-side fallback for matching completed games only; cached for 15 minutes. Not a live-score guarantee. |
| Live scores, game state, latest play, and live box scores | ESPN public scoreboard and summary endpoints | Best effort only. Score/status/situation refresh every 10 seconds during live games; box-score summaries refresh every 60 seconds. Pregame polling is every 60 seconds within 90 minutes of kickoff and every five minutes otherwise. |

The `/api/live/games` route reads ESPN scoreboard data for UTC yesterday, today, and tomorrow, and fetches summaries for live and halftime games. Scoreboard responses are cached in server memory for 10 seconds; box-score summaries are cached for 60 seconds; concurrent requests are coalesced. During active games, each app process makes at most three scoreboard requests per 10-second cache window (up to 18/minute) plus about one summary request per active game per minute. Each additional app process/task has its own cache and may add similar upstream traffic. Browser requests use this same-origin route, poll every 10 seconds during games, every 60 seconds within 90 minutes of kickoff, and every five minutes otherwise; polling pauses while the tab is hidden. The NFL Data API documents a 100-request/minute/IP limit for its own API, but that limit does **not** apply to ESPN. ESPN does not publish a dependable quota for its public scoreboard/summary endpoints, so these rates are conservative best-effort choices, not a guarantee of capacity. The active-game ticker remains separate from the next-kickoff countdown so a live game stays visible after its kickoff window has passed. Homepage ticker rows link to the matching game-detail page and include a compact offense-oriented vector field with end zones, 10-yard markers, and a small arrow integrated beside the ball pointing toward OPP; the graphic is omitted from the game-detail live updates row. The ball is plotted directly from ESPN's validated 0–100 field coordinate. Arrow direction is established only by positive yardage from the current offense, ignores penalties and backward/no-gain plays, remains fixed per team for each half, and reverses at halftime; when direction is unknown, the ball remains visible but no arrow or offense-relative spot is guessed. An accessible label reports when location data is unavailable. The offense team is mapped from ESPN's possession team ID and competitor IDs: `possessionText` may identify the team whose yard line is shown, not the team with the ball. The possession underline uses that team's accent color. Down/distance and red-zone context appear when supplied. Red-zone situations receive a subtle tinted row and watermark. Explicit penalties use a compact broadcast-style FLAG strip with a yellow field, dark label, and penalty description; review notices appear only when the feed explicitly signals a review. The ticker and game status explicitly label halftime and the two-minute warning when reported by ESPN or when the clock reaches 2:00 in the second/fourth quarter. A detected touchdown gets a distinct gold celebratory TOUCHDOWN banner with the scoring team's accent, separate from penalty/review strips and ordinary key-play alerts. Live game pages show available team totals and player-stat tables expanded in a readable, scannable layout; the feed and its data are explicitly best effort, and delayed/unavailable data is surfaced rather than described as guaranteed live. The `/api/live` route serves live data; `/api/health` is the container liveness endpoint and `/api/ready` is the load-balancer readiness endpoint. The dashboard also shows a ticker of the five soonest scheduled games, with Thursday/Monday night labels inferred from game date and Sunday night identified when kickoff time is available. When an authoritative absolute kickoff timestamp is available, every game surface displays only the kickoff clock time converted in the visitor's browser timezone—no date or timezone abbreviation. Unknown kickoff times are shown as pending rather than inferred from a date or timezone-ambiguous value. Older missing final scores use the ESPN scoreboard fallback described below. Local development and the container use the same providers, but their caches are separate. See [ADR-002](docs/adr/ADR-002-transition-to-nfl-games-and-statistics.m) for the architectural decision.

The homepage live ticker keeps every game's mini-field aligned using shared columns, independent of score width, with fixed-height cards and field placement so changing game statuses do not alter spacing. Each matchup has a minimal icon chevron to collapse or expand its live details independently while keeping the matchup and score visible. Hold a live row briefly and drag it to reorder games; use `Alt` + `↑` / `↓` when keyboard reordering is preferred. The row order and each collapsed state survive live refreshes.

The mini-field uses ESPN's 0–100 field coordinate as a fixed left-to-right axis. The ball marker uses that coordinate directly, and the arrow follows the direction of the latest nonzero play movement; when a play changes possession, its direction is reversed for the new offense. The recent drive summary supplies the last known direction when the latest play has no movement, and the browser carries that direction across no-gain updates and flips it immediately when possession changes. If direction cannot be established, the graphic omits the arrow/ball rather than guessing. A thin in-card banner marks provider-reported penalties as `FLAG` and active replay reviews as `UNDER REVIEW`; ordinary plays do not show a banner.

## Interface

The main route `/` brings games, records, player lookup, and team comparisons into one dashboard. `/games` and `/standings` jump to those dashboard sections; `/teams` and `/teams/:team`, `/games/:gameId`, and `/players` and `/players/:player` provide directories and detail views. Player lookup offers close-name suggestions for common typos using a small number of cached provider searches, and form submissions return visitors to the feature they used rather than the page top.

Team marks and player avatars are original inline SVGs built from team abbreviations and player initials; team marks use recognizable team-specific color palettes. NFL-owned logos and player photos are not downloaded or rehosted; use them only if an authorized asset license/source is provided.

## Technology

- [Astro](https://astro.build) with server-side rendering and the Node standalone adapter
- [Motion](https://motion.dev) for restrained player-stat and standings reveals plus game-card hover feedback, with reduced-motion support
- Node.js 22 or newer
- Docker multi-stage production image with dependency-layer caching
- Persistent `/app/data` volume for server-side API cache files
- AWS CDK stacks for independent S3/CloudFront static and ECS/ALB SSR services

## Run locally

Install dependencies and start the development server:

```sh
npm ci
npm run dev
```

The local site is available at <http://localhost:4321>. Useful project commands:

| Command | Purpose |
| --- | --- |
| `npm run check` | Type-check with Astro |
| `npm run lint` | Run ESLint |
| `npm run test:unit` | Run unit tests |
| `npm run test:e2e` | Run Playwright tests against a local NFL API fixture |
| `npm run build` | Build the production application |
| `npm run build:static` | Build the independent static site into `dist-static/` |
| `npm run preview` | Preview the production build |

Playwright starts an isolated local fixture server for NFL and ESPN data, so browser tests are repeatable and do not depend on external provider availability.

## Docker

The root `Dockerfile` uses separate build, production-dependency, and runtime stages. Docker caches dependency installation using `package.json` and `package-lock.json`; ordinary source or content changes do not require reinstalling dependencies. The final image runs as a non-root user and includes a health check for `/api/health`.

### Docker Desktop or OrbStack

OrbStack's Docker engine works with the standard Docker CLI commands below. Start OrbStack first, then run these from the repository root. The named volume preserves application data when containers are replaced.

For a local build using your machine's architecture:

```sh
docker build -t gridiron-atlas:local .
docker run -d \
  --name gridiron-atlas \
  -p 4321:4321 \
  -e NODE_ENV=production \
  -v nfl-weekend-data:/app/data \
  gridiron-atlas:local
```

For a cloud-compatible x86-64 image (also works on Apple Silicon through emulation):

```sh
docker build --platform linux/amd64 -t astro-blog:v1.0.0 .
docker run -d \
  --name gridiron-atlas \
  -p 4321:4321 \
  -e NODE_ENV=production \
  -v nfl-weekend-data:/app/data \
  astro-blog:v1.0.0
```

Check the app and Docker health status:

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

## AWS deployments

AWS CDK defines two independently deployable services:

| Service | CDK stack | Hosting | Deployment workflow |
| --- | --- | --- | --- |
| Static landing site | `StaticSiteStack` | Private S3 bucket served through CloudFront | `deploy-static.yml` |
| Live dashboard | `SsrStack` | ECS Fargate behind an Application Load Balancer | `deploy-ssr.yml` |

Both workflows run after successful CI on `main` and can be dispatched manually from `main`. The static workflow runs `npm run build:static` before deploying `StaticSiteStack`; the SSR workflow builds the Docker image through the CDK asset.

The SSR service exposes two probe endpoints:

| Endpoint | Purpose | Response |
| --- | --- | --- |
| `/api/health` | Liveness probe used by Docker and the ECS container health check | HTTP 200 JSON with `status`, `uptime`, and `timestamp` |
| `/api/ready` | Readiness probe used by the ALB target group | HTTP 200 JSON with `status: "ready"` |

## Current structure

```text
├── public/              # Static assets
├── src/
│   ├── components/      # Shared NFL navigation and data-state UI
│   ├── layouts/         # Shared page layouts
│   ├── pages/
│   │   └── api/         # Health, readiness, and liveness endpoints
│   └── static/          # Standalone static-site source
├── docs/adr/            # Architecture decision records
├── Dockerfile
├── astro.config.mjs
├── astro.static.config.mjs
└── package.json
```

The NFL Data API is read-only and queried on demand from the Astro server; cached reads prevent every page view from producing a separate upstream request.

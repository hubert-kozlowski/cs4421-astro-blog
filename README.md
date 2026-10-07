# NFL Weekend

An Astro server-rendered NFL games and statistics explorer in development. The goal is to make it easy to see the week's games at a glance, then browse to detailed game, team, player, and standings information when wanted.

The interface is intended to be clear and approachable rather than presenting every statistic at once. Game and data freshness should be visible, and deeper detail should be available through dedicated pages.

> **Project status:** The Astro application and Docker runtime are in place. The NFL data integrations and NFL-focused pages are planned; they are not yet wired into the application.

## Data providers

The planned data flow keeps provider requests on the server, validates and maps responses into application data, and caches results so each visitor does not make a separate request to a provider.

| Use | Provider | Status |
| --- | --- | --- |
| Schedules, completed and historical games, standings, and statistics | [NFL Data API](https://api.nfldata.org/docs), backed by [nflverse](https://github.com/nflverse) data | Selected as the initial provider; integration is planned. |
| Optional live scores and game updates | ESPN public-facing endpoints | Candidate only. These are not a supported developer API and must be checked for reliability and acceptable use before integration. |

The intended refresh policy separates slower-changing data from live scores: scheduled refreshes for general statistics and, if the ESPN option is verified and implemented, a separate server-side cache refreshed during games. Live information must not be presented as guaranteed real time. See [ADR-002](docs/adr/ADR-002-transition-to-nfl-games-and-statistics.m) for the architectural decision.

## Technology

- [Astro](https://astro.build) with server-side rendering and the Node standalone adapter
- Node.js 22 or newer
- Docker multi-stage production image with dependency-layer caching
- Persistent `/app/data` directory reserved for the planned NFL data cache

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
| `npm run build` | Build the production application |
| `npm run preview` | Preview the production build |

## Docker

The root `Dockerfile` uses separate build, production-dependency, and runtime stages. Docker caches dependency installation using `package.json` and `package-lock.json`; ordinary source or content changes do not require reinstalling dependencies. The final image runs as a non-root user and includes a health check for `/api/health`.

### Docker Desktop or OrbStack

OrbStack's Docker engine works with the standard Docker CLI commands below. Start OrbStack first, then run these from the repository root. The named volume preserves application data when containers are replaced.

For a local build using your machine's architecture:

```sh
docker build -t nfl-weekend:local .
docker run -d \
  --name nfl-weekend \
  -p 4321:4321 \
  -e NODE_ENV=production \
  -v nfl-weekend-data:/app/data \
  nfl-weekend:local
```

For a cloud-compatible x86-64 image (also works on Apple Silicon through emulation):

```sh
docker build --platform linux/amd64 -t astro-blog:v1.0.0 .
docker run -d \
  --name my-blog \
  -p 4321:4321 \
  -e NODE_ENV=production \
  -v nfl-weekend-data:/app/data \
  astro-blog:v1.0.0
```

Check the app and Docker health status:

```sh
curl http://localhost:4321/api/health
docker ps
docker inspect --format='{{.State.Health.Status}}' my-blog
docker logs my-blog
```

In OrbStack, the same running container and image are also visible in its Containers and Images views. You can inspect container status and logs there; the CLI commands above work with both OrbStack and Docker Desktop.

Stop and remove a container when finished. Removing the container does not remove the named data volume:

```sh
docker stop my-blog
docker rm my-blog
```

To use a different host port if `4321` is already occupied, change the left side of the mapping (for example, `-p 4322:4321`) and visit <http://localhost:4322>.

The container sets `NFL_DATA_DIR=/app/data` as the intended location for NFL cache files. Data ingestion has not yet been implemented.

### Push to Amazon ECR

Authenticate, tag, and push the cloud-compatible image to the project's ECR repository in `us-east-1`:

```sh
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 782086108883.dkr.ecr.us-east-1.amazonaws.com

docker tag astro-blog:v1.0.0 782086108883.dkr.ecr.us-east-1.amazonaws.com/astro-blog:v1.0.0
docker push 782086108883.dkr.ecr.us-east-1.amazonaws.com/astro-blog:v1.0.0
```

AWS CLI credentials need permission to authenticate and push to the ECR repository. The repository has immutable tags, so choose a new version tag for each published image.

## Current structure

```text
├── public/              # Static assets
├── src/
│   ├── components/      # Shared Astro UI components
│   ├── content/         # Existing blog posts and author entries
│   ├── layouts/         # Shared page layouts
│   ├── pages/
│   │   └── api/         # Health, readiness, and liveness endpoints
│   └── utils/           # Shared utilities
├── docs/adr/            # Architecture decision records
├── Dockerfile
├── astro.config.mjs
└── package.json
```

The current content collection still includes the original blog. NFL pages, provider clients, and the scheduled data refresh will be added as the product transition proceeds.

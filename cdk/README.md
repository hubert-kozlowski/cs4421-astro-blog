# Astro SSR CDK Deployment

The CDK stack builds the repository's Docker image and deploys the Astro standalone server to ECS Fargate behind a public Application Load Balancer. The deployed URL is available in the `SiteUrl` stack output.

## Requirements

- Node.js 22
- Docker running locally (CDK builds and publishes the image)
- AWS credentials configured for the target account

Run these commands from `cdk/`:

```sh
npm ci
npm test
npm run build
npx cdk synth
npx cdk deploy --require-approval never
```

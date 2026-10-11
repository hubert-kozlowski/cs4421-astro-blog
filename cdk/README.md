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

The GitHub Actions CI runs the CDK tests, TypeScript build, and synthesis, then builds the production Docker image and smoke-tests `/`, `/api/health`, `/api/live`, and `/api/ready`. Deployment runs only after the `main` push has passed the Continuous Integration workflow, or when manually dispatched.

The first deployment requires the target AWS account to be bootstrapped for CDK and the GitHub Actions credentials to have permission to deploy the stack, publish its container image, and create/update the ECS, VPC, and load-balancer resources. The stack currently publishes an HTTP load-balancer URL; configure a domain and TLS separately if required.

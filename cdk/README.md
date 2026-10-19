# Astro SSR CDK Deployment

`CdkStack` builds the repository's Docker image and deploys the Astro standalone server to ECS Fargate behind a public Application Load Balancer. The separate `StaticSiteStack` deploys the static site to a private S3 bucket behind CloudFront. The deployed URLs are available from the `SiteUrl` and `StaticSiteUrl` stack outputs.

## Requirements

- Node.js 22
- Docker running locally (CDK builds and publishes the image)
- AWS credentials configured for the target account
- Build the static Astro output from the repository root with `npm run build:static` before CDK synthesis or deployment.

Run these commands from `cdk/`:

```sh
npm ci
npm test
npm run build
npx cdk synth
npx cdk deploy CdkStack --require-approval never
```

Deploy the static service from the repository root build output with `npx cdk deploy StaticSiteStack --require-approval never`. Its `BucketDeployment` invalidates CloudFront after publishing updated assets.

The GitHub Actions CI builds both Astro outputs, runs CDK tests, TypeScript build, and synthesis, then builds the production Docker image and smoke-tests `/`, `/api/health`, `/api/live`, and `/api/ready`. Deployment workflows run only after the `main` push has passed Continuous Integration, or when manually dispatched.

The first deployment requires the target AWS account to be bootstrapped for CDK and the GitHub Actions credentials to have permission to deploy stacks, publish container assets, and create/update ECS, VPC, load-balancer, S3, and CloudFront resources. The SSR stack publishes an HTTP load-balancer URL; configure a domain and TLS separately if required.

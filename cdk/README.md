# Astro SSR CDK Deployment

`CdkStack` builds the repository's Docker image and deploys the Astro standalone server to ECS Fargate behind a public Application Load Balancer. The separate `StaticSiteStack` deploys the static site to a private S3 bucket behind CloudFront. The deployed URLs are available from the `SiteUrl` and `StaticSiteUrl` stack outputs.

## Requirements

- Node.js 22
- Docker running locally (CDK builds and publishes the image)
- AWS credentials configured for the target account
- From the repository root, build the static release from tag `1.0.0` into `static-source/dist` before CDK synthesis or deployment:

  ```sh
  mkdir -p static-source
  git archive 1.0.0 | tar -x -C static-source
  (cd static-source && npm ci && npm run build)
  ```

Run these commands from `cdk/`:

```sh
npm ci
npm test
npm run build
npx cdk synth
npx cdk deploy CdkStack --require-approval never
```

Deploy the static service from `static-source/dist` with `npx cdk deploy StaticSiteStack --require-approval never`. Its `BucketDeployment` invalidates CloudFront after publishing updated assets.

The GitHub Actions CI builds the SSR application from `main` and the static application from tag `1.0.0`, runs CDK tests, TypeScript build, and synthesis, then builds the production Docker image and smoke-tests `/`, `/api/health`, `/api/live`, and `/api/ready`. Deployment workflows run only after the `main` push has passed the Continuous Integration workflow, or when manually dispatched.

The first deployment requires the target AWS account to be bootstrapped for CDK and the GitHub Actions credentials to have permission to deploy stacks, publish container assets, and create/update ECS, VPC, load-balancer, S3, and CloudFront resources. The SSR stack publishes an HTTP load-balancer URL; configure a domain and TLS separately if required.

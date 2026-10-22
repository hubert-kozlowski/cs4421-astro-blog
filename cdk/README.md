# Astro SSR CDK Deployment

`SsrSiteStack` in `lib/ssr-site-stack.ts` builds the repository's Docker image and deploys the Astro standalone server to ECS Fargate behind a public Application Load Balancer. It retains the deployed CDK stack ID `CdkStack` to avoid replacing the existing CloudFormation stack. CloudFront provides the public HTTPS endpoint for `gridironatlas.app`; the load balancer is its origin. The separate `StaticSiteStack` deploys the static site to a private S3 bucket behind CloudFront. The deployed URLs are available from the `SiteUrl`, `CloudFrontDomainName`, and `StaticSiteUrl` stack outputs.

## Requirements

- Node.js 22
- Docker running locally (CDK builds and publishes the image)
- AWS credentials configured for the target account
- From the repository root, build the static release from tag `1.0.0` into `static-source/dist` before CDK synthesis or deployment:

  ```sh
  mkdir -p static-source
  git archive 1.0.0 | tar -x -C static-source
  node scripts/configure-static-site-origin.mjs static-source https://<cloudfront-domain>
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

The GitHub Actions CI builds the SSR application from `main` and the static application from tag `1.0.0`, runs CDK tests, TypeScript build, and synthesis, then builds the production Docker image and smoke-tests `/`, `/api/health`, `/api/live`, and `/api/ready`. The static deployment bootstraps its CloudFront distribution before configuring the tagged Astro build's `site` origin, so its sitemap uses the deployed public URL. Deployment workflows run only after the `main` push has passed the Continuous Integration workflow, or when manually dispatched.

The first deployment requires the target AWS account to be bootstrapped for CDK and the GitHub Actions credentials to have permission to deploy stacks, publish container assets, and create/update ECS, VPC, load-balancer, S3, and CloudFront resources.

## Gridiron Atlas domain at Name.com

The production dashboard is served from `https://gridironatlas.app` (and also accepts `https://www.gridironatlas.app`). The public certificate is intentionally deployed in the separate `GridironAtlasCertificateStack`: Name.com hosts DNS, so ACM validation records must be added outside AWS before the certificate stack can finish.

1. From `cdk/`, start the certificate deployment:

   ```sh
   npx cdk deploy GridironAtlasCertificateStack --require-approval never
   ```

   It waits in `CREATE_IN_PROGRESS` until DNS validation succeeds. In another terminal, get the exact records ACM requested:

   ```sh
   aws acm list-certificates --region us-east-1 --certificate-statuses PENDING_VALIDATION \
     --query 'CertificateSummaryList[?DomainName==`gridironatlas.app`].CertificateArn' --output text
   aws acm describe-certificate --region us-east-1 --certificate-arn <certificate-arn> \
     --query 'Certificate.DomainValidationOptions[].ResourceRecord' --output table
   ```

2. At Name.com, open **My Domains → gridironatlas.app → Manage DNS Records** and add every CNAME returned by ACM exactly as shown. Use the record name without the `.gridironatlas.app` suffix when Name.com asks for a host. Keep these CNAMEs permanently so ACM can renew the certificate automatically.

3. After ACM reports `ISSUED` and the certificate deployment completes, deploy the application stack:

   ```sh
   npx cdk deploy CdkStack --require-approval never
   ```

4. Copy the `CloudFrontDomainName` output and add these Name.com records with a TTL of 300:

   | Type | Host | Answer |
   | --- | --- | --- |
   | ANAME | `@` | `<CloudFrontDomainName>` |
   | ANAME | `www` | `<CloudFrontDomainName>` |

   Name.com ANAME records flatten the CloudFront hostname for both the apex and `www` names. Do not point either name at the ECS load balancer or use the old HTTP `SiteUrl` output.

5. Verify after DNS propagation:

   ```sh
   curl --fail --location https://gridironatlas.app/api/health
   curl --fail --location https://www.gridironatlas.app/api/health
   ```

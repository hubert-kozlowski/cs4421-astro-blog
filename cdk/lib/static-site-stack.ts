import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

export class StaticSiteStack extends cdk.Stack {
	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const staticSiteBucket = new s3.Bucket(this, 'StaticSiteBucket', {
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			encryption: s3.BucketEncryption.S3_MANAGED,
			enforceSSL: true,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
		});
		const routingFunction = new cloudfront.Function(this, 'StaticRouteRewriter', {
			runtime: cloudfront.FunctionRuntime.JS_2_0,
			code: cloudfront.FunctionCode.fromInline(`function handler(event) {
	var request = event.request;
	var uri = request.uri;

	if (uri.endsWith('/')) {
		request.uri += 'index.html';
	} else if (!uri.includes('.')) {
		request.uri += '/index.html';
	}

	return request;
}`),
		});
		const staticSiteDistribution = new cloudfront.Distribution(this, 'StaticSiteDistribution', {
			defaultRootObject: 'index.html',
			defaultBehavior: {
				origin: origins.S3BucketOrigin.withOriginAccessControl(staticSiteBucket),
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				functionAssociations: [
					{
						function: routingFunction,
						eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
					},
				],
			},
		});

		new s3deploy.BucketDeployment(this, 'DeployStaticSite', {
			sources: [s3deploy.Source.asset(path.join(__dirname, '../../static-source/dist'))],
			destinationBucket: staticSiteBucket,
			distribution: staticSiteDistribution,
			distributionPaths: ['/*'],
		});

		new cdk.CfnOutput(this, 'StaticSiteUrl', {
			value: `https://${staticSiteDistribution.distributionDomainName}`,
		});
	}
}

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

export class StaticSiteStack extends cdk.Stack {
	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const siteBucket = new s3.Bucket(this, 'SiteBucket', {
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		// Lambda@Edge function to handle SPA routing
		const originRequestFunction = new cloudfront.experimental.EdgeFunction(this, 'OriginRequestFn', {
			runtime: lambda.Runtime.NODEJS_18_X,
			handler: 'index.handler',
			code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-edge')),
		});

		const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
			defaultBehavior: {
				origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				edgeLambdas: [
					{
						functionVersion: originRequestFunction.currentVersion,
						eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
					},
				],
			},
			defaultRootObject: 'index.html',
		});

		new s3deploy.BucketDeployment(this, 'DeploySite', {
			sources: [s3deploy.Source.asset('../dist')],
			destinationBucket: siteBucket,
			distribution,
			distributionPaths: ['/*'],
		});
	}
}

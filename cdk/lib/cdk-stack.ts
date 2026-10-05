import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export class StaticSiteStack extends cdk.Stack {
	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const siteBucket = new s3.Bucket(this, 'SiteBucket', {
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		const routingFunction = new cloudfront.Function(this, 'RoutingFunction', {
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

		const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
			defaultBehavior: {
				origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				functionAssociations: [
					{
						function: routingFunction,
						eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
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

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StaticSiteStack } from '../lib/cdk-stack';

describe('StaticSiteStack', () => {
	it('associates a CloudFront Function with viewer requests', () => {
		const app = new cdk.App();
		const stack = new StaticSiteStack(app, 'TestStack');
		const template = Template.fromStack(stack);

		template.resourceCountIs('AWS::CloudFront::Function', 1);
		template.resourceCountIs('AWS::Lambda::Version', 0);
		template.hasResourceProperties('AWS::CloudFront::Function', {
			FunctionConfig: {
				Runtime: 'cloudfront-js-2.0',
			},
		});
		template.hasResourceProperties('AWS::CloudFront::Distribution', {
			DistributionConfig: {
				DefaultCacheBehavior: {
					FunctionAssociations: [
						{
							EventType: 'viewer-request',
						},
					],
				},
			},
		});
	});
});

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BlogStack } from '../lib/cdk-stack';

describe('BlogStack', () => {
	it('deploys the standalone app as an ECS service behind a load balancer', () => {
		const app = new cdk.App();
		const stack = new BlogStack(app, 'TestStack');
		const template = Template.fromStack(stack);

		template.resourceCountIs('AWS::ECS::Service', 1);
		template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
		template.resourceCountIs('AWS::S3::Bucket', 0);
		template.resourceCountIs('AWS::CloudFront::Distribution', 0);
		template.hasResourceProperties('AWS::ECS::TaskDefinition', {
			Cpu: '256',
			Memory: '512',
			ContainerDefinitions: Match.arrayWith([
				Match.objectLike({
					PortMappings: Match.arrayWith([Match.objectLike({ ContainerPort: 4321 })]),
				}),
			]),
		});
	});
});

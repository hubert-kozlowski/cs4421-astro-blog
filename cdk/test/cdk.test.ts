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
					HealthCheck: Match.objectLike({
						Command: Match.arrayWith([
							'CMD',
							'node',
							'-e',
							Match.stringLikeRegexp('/api/live'),
						]),
						Interval: 30,
						Timeout: 5,
						Retries: 3,
						StartPeriod: 30,
					}),
				}),
			]),
		});
		template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
			HealthCheckPath: '/api/ready',
			Matcher: { HttpCode: '200' },
		});
	});
});

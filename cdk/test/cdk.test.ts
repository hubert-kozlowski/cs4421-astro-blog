import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SsrSiteStack } from '../lib/ssr-site-stack';
import { StaticSiteStack } from '../lib/static-site-stack';

describe('SsrSiteStack', () => {
	it('deploys the SSR app as an ECS service behind a load balancer', () => {
		const app = new cdk.App();
		const stack = new SsrSiteStack(app, 'TestStack');
		const template = Template.fromStack(stack);

		template.resourceCountIs('AWS::ECS::Service', 1);
		template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
		template.resourceCountIs('AWS::S3::Bucket', 0);
		template.resourceCountIs('AWS::CloudFront::Distribution', 0);
		template.resourceCountIs('AWS::CloudWatch::Alarm', 4);
		template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
		template.resourceCountIs('AWS::Logs::MetricFilter', 1);
		template.hasResourceProperties('AWS::SSM::Parameter', { Name: '/blog/metrics/alb-dimension' });
		template.hasResourceProperties('AWS::ECS::Cluster', {
			ClusterSettings: [{ Name: 'containerInsights', Value: 'enabled' }],
		});
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
							Match.stringLikeRegexp('/api/health'),
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

	it('deploys a static site through CloudFront and a private S3 bucket', () => {
		const app = new cdk.App();
		const stack = new StaticSiteStack(app, 'TestStack');
		const template = Template.fromStack(stack);

		template.resourceCountIs('AWS::ECS::Service', 0);
		template.resourceCountIs('AWS::S3::Bucket', 1);
		template.resourceCountIs('AWS::CloudFront::Distribution', 1);
		template.hasResourceProperties('AWS::S3::Bucket', {
			PublicAccessBlockConfiguration: {
				BlockPublicAcls: true,
				BlockPublicPolicy: true,
				IgnorePublicAcls: true,
				RestrictPublicBuckets: true,
			},
		});
	});
});

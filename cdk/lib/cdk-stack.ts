import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as path from 'path';

export class BlogStack extends cdk.Stack {
	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const vpc = new ec2.Vpc(this, 'Vpc', {
			maxAzs: 2,
			natGateways: 0,
			subnetConfiguration: [{ name: 'Public', subnetType: ec2.SubnetType.PUBLIC }],
		});

		const cluster = new ecs.Cluster(this, 'Cluster', { vpc });
		const taskDefinition = new ecs.FargateTaskDefinition(this, 'BlogTask', {
			cpu: 256,
			memoryLimitMiB: 512,
		});
		taskDefinition.addContainer('Web', {
			image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../..')),
			environment: {
				HOST: '0.0.0.0',
				NODE_ENV: 'production',
				PORT: '4321',
			},
			logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'blog' }),
			healthCheck: {
				command: [
					'CMD',
					'node',
					'-e',
					"fetch('http://127.0.0.1:4321/api/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))",
				],
				interval: cdk.Duration.seconds(30),
				timeout: cdk.Duration.seconds(5),
				retries: 3,
				startPeriod: cdk.Duration.seconds(30),
			},
			portMappings: [{ containerPort: 4321 }],
		});

		const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'BlogService', {
			cluster,
			taskDefinition,
			desiredCount: 1,
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			assignPublicIp: true,
			healthCheckGracePeriod: cdk.Duration.seconds(60),
			circuitBreaker: { rollback: true },
		});

		service.targetGroup.configureHealthCheck({
			path: '/api/ready',
			healthyHttpCodes: '200',
		});

		new cdk.CfnOutput(this, 'SiteUrl', {
			value: `http://${service.loadBalancer.loadBalancerDnsName}`,
		});
	}
}

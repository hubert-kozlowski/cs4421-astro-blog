import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export class SsrSiteStack extends cdk.Stack {
	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const vpc = new ec2.Vpc(this, 'Vpc', {
			maxAzs: 2,
			natGateways: 0,
			subnetConfiguration: [{ name: 'Public', subnetType: ec2.SubnetType.PUBLIC }],
		});

		const cluster = new ecs.Cluster(this, 'Cluster', {
			vpc,
			containerInsightsV2: ecs.ContainerInsights.ENABLED,
		});
		const taskDefinition = new ecs.FargateTaskDefinition(this, 'BlogTask', {
			cpu: 256,
			memoryLimitMiB: 512,
		});
		const logGroup = new logs.LogGroup(this, 'WebLogs', {
			retention: logs.RetentionDays.ONE_MONTH,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});
		taskDefinition.taskRole.addToPrincipalPolicy(
			new iam.PolicyStatement({ actions: ['cloudwatch:GetMetricData'], resources: ['*'] }),
		);
		const container = taskDefinition.addContainer('Web', {
			image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../..')),
			environment: {
				HOST: '0.0.0.0',
				NODE_ENV: 'production',
				PORT: '4321',
			},
			logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'blog', logGroup }),
			healthCheck: {
				command: [
					'CMD',
					'node',
					'-e',
					"fetch('http://127.0.0.1:4321/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))",
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

		container.addEnvironment('ECS_CLUSTER', cluster.clusterName);
		container.addEnvironment('ECS_SERVICE', service.service.serviceName);
		container.addEnvironment('ALB_DIMENSION', service.loadBalancer.loadBalancerFullName);
		container.addEnvironment('AWS_REGION', this.region);

		const errorFilter = new logs.MetricFilter(this, 'ErrorLogFilter', {
			logGroup,
			metricNamespace: 'BlogWeb',
			metricName: 'ErrorLogs',
			filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'error'),
			metricValue: '1',
			defaultValue: 0,
		});
		const alarm = (id: string, metric: cloudwatch.IMetric, threshold: number) =>
			new cloudwatch.Alarm(this, id, {
				metric,
				threshold,
				evaluationPeriods: 3,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			});
		alarm('HighCpu', service.service.metricCpuUtilization(), 70);
		alarm('HighMemory', service.service.metricMemoryUtilization(), 80);
		alarm(
			'Target5xx',
			new cloudwatch.Metric({
				namespace: 'AWS/ApplicationELB',
				metricName: 'HTTPCode_Target_5XX_Count',
				dimensionsMap: { LoadBalancer: service.loadBalancer.loadBalancerFullName },
				statistic: 'Sum',
			}),
			5,
		);
		alarm('ErrorLogs', errorFilter.metric({ statistic: 'Sum', period: cdk.Duration.minutes(5) }), 5);

		new cloudwatch.Dashboard(this, 'Dashboard', {
			widgets: [
				[
					new cloudwatch.GraphWidget({ title: 'CPU / Memory %', left: [service.service.metricCpuUtilization(), service.service.metricMemoryUtilization()] }),
					new cloudwatch.GraphWidget({ title: 'Requests', left: [service.targetGroup.metrics.requestCount()] }),
					new cloudwatch.GraphWidget({ title: 'Error logs', left: [errorFilter.metric({ statistic: 'Sum' })] }),
				],
			],
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

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';

export interface SsrSiteStackProps extends cdk.StackProps {
	readonly certificate: acm.ICertificate;
}

export class SsrSiteStack extends cdk.Stack {
	constructor(scope: cdk.App, id: string, props: SsrSiteStackProps) {
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
		const albParamName = '/blog/metrics/alb-dimension';
		const serviceName = 'blog-service';
		taskDefinition.taskRole.addToPrincipalPolicy(
			new iam.PolicyStatement({
				actions: ['ssm:GetParameter'],
				resources: [cdk.Arn.format({ service: 'ssm', resource: 'parameter', resourceName: albParamName.slice(1) }, this)],
			}),
		);
		const container = taskDefinition.addContainer('Web', {
			// Local development commonly runs on Apple Silicon, while this Fargate
			// service uses the default x86_64 runtime. Build the deployable image
			// explicitly for the runtime to avoid an "exec format error" on ECS.
			image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../..'), {
				platform: ecrAssets.Platform.LINUX_AMD64,
				buildArgs: { SITE_URL: process.env.SITE_URL ?? 'https://gridironatlas.app' },
			}),
			environment: {
				HOST: '0.0.0.0',
				NODE_ENV: 'production',
				PORT: '4321',
				ECS_CLUSTER: cluster.clusterName,
				ECS_SERVICE: serviceName,
				ALB_DIMENSION_PARAM: albParamName,
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
			serviceName,
			desiredCount: 1,
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			assignPublicIp: true,
			healthCheckGracePeriod: cdk.Duration.seconds(60),
			circuitBreaker: { rollback: true },
		});

		// The load balancer name is only known after the service exists, so the app reads it
		// from SSM at runtime instead of via an env var (which would create a dependency cycle).
		new ssm.StringParameter(this, 'AlbDimensionParam', {
			parameterName: albParamName,
			stringValue: service.loadBalancer.loadBalancerFullName,
		});

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

		const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
			comment: 'Gridiron Atlas SSR edge distribution',
			domainNames: ['gridironatlas.app', 'www.gridironatlas.app'],
			certificate: props.certificate,
			minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
			defaultBehavior: {
				origin: new origins.LoadBalancerV2Origin(service.loadBalancer, {
					protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
				}),
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
				originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
				allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
			},
		});

		new cdk.CfnOutput(this, 'SiteUrl', {
			value: 'https://gridironatlas.app',
		});
		new cdk.CfnOutput(this, 'CloudFrontDomainName', {
			value: distribution.distributionDomainName,
		});
	}
}

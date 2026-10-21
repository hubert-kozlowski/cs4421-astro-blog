import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { getDailySeries, getResourceSnapshot, type DailyPoint } from './runtime-metrics';
import { computeTrend, utilizationSeverity, type Severity, type Trend } from './trend';

export interface StatCard {
	key: string;
	label: string;
	value: string;
	detail?: string;
	trend: Trend;
	percentUsed?: number;
	severity?: Severity;
}

export interface MetricsDashboard {
	source: 'cloudwatch' | 'process';
	generatedAt: string;
	note?: string;
	daily: DailyPoint[];
	cards: StatCard[];
	resources: StatCard[];
	scaleFirst: { label: string; percentUsed: number; severity: Severity } | null;
}

const DAYS = 7;
const CACHE_MS = 60_000;
let cache: { at: number; value: MetricsDashboard } | null = null;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

async function cloudWatchConfig() {
	const { ALB_DIMENSION, ALB_DIMENSION_PARAM, ECS_CLUSTER, ECS_SERVICE, AWS_REGION } = process.env;
	if (!ECS_CLUSTER || !ECS_SERVICE || !(ALB_DIMENSION || ALB_DIMENSION_PARAM)) return null;
	let alb = ALB_DIMENSION;
	if (!alb && ALB_DIMENSION_PARAM) {
		const res = await new SSMClient({ region: AWS_REGION }).send(
			new GetParameterCommand({ Name: ALB_DIMENSION_PARAM }),
		);
		alb = res.Parameter?.Value;
	}
	if (!alb) return null;
	return { alb, cluster: ECS_CLUSTER, service: ECS_SERVICE, region: AWS_REGION };
}

async function fetchCloudWatchSeries(cfg: NonNullable<Awaited<ReturnType<typeof cloudWatchConfig>>>) {
	const client = new CloudWatchClient({ region: cfg.region });
	const end = new Date();
	end.setUTCHours(24, 0, 0, 0);
	const start = new Date(end.getTime() - DAYS * 2 * 86_400_000);
	const albDims = [{ Name: 'LoadBalancer', Value: cfg.alb }];
	const ecsDims = [
		{ Name: 'ClusterName', Value: cfg.cluster },
		{ Name: 'ServiceName', Value: cfg.service },
	];
	const q = (
		id: string,
		namespace: string,
		metric: string,
		dims: { Name: string; Value: string }[],
		stat: string,
	) => ({
		Id: id,
		MetricStat: {
			Metric: { Namespace: namespace, MetricName: metric, Dimensions: dims },
			Period: 86_400,
			Stat: stat,
		},
	});
	const result = await client.send(
		new GetMetricDataCommand({
			StartTime: start,
			EndTime: end,
			ScanBy: 'TimestampAscending',
			MetricDataQueries: [
				q('req', 'AWS/ApplicationELB', 'RequestCount', albDims, 'Sum'),
				q('err', 'AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', albDims, 'Sum'),
				q('lat', 'AWS/ApplicationELB', 'TargetResponseTime', albDims, 'Average'),
				q('cpu', 'AWS/ECS', 'CPUUtilization', ecsDims, 'Average'),
				q('mem', 'AWS/ECS', 'MemoryUtilization', ecsDims, 'Average'),
				q('stu', 'ECS/ContainerInsights', 'EphemeralStorageUtilized', ecsDims, 'Average'),
				q('str', 'ECS/ContainerInsights', 'EphemeralStorageReserved', ecsDims, 'Average'),
			],
		}),
	);
	const byDate = (id: string) => {
		const r = result.MetricDataResults?.find((m) => m.Id === id);
		const map = new Map<string, number>();
		r?.Timestamps?.forEach((t, i) => map.set(t.toISOString().slice(0, 10), r.Values?.[i] ?? 0));
		return map;
	};
	const dates = Array.from({ length: DAYS * 2 }, (_, i) =>
		new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10),
	);
	const get = (id: string) => {
		const m = byDate(id);
		return dates.map((d) => m.get(d) ?? 0);
	};
	return { dates, req: get('req'), err: get('err'), lat: get('lat'), cpu: get('cpu'), mem: get('mem'), stu: get('stu'), str: get('str') };
}

function buildCards(input: {
	req: number[];
	err: number[];
	latMs: number[];
	cpu: number[];
	mem: number[];
	storage: number[] | null;
	storageDetail?: string;
	memDetail?: string;
}) {
	const split = (xs: number[]) => [xs.slice(0, DAYS), xs.slice(DAYS)] as const;
	const [reqPrev, reqCur] = split(input.req);
	const [errPrev, errCur] = split(input.err);
	const [latPrev, latCur] = split(input.latMs);
	const [cpuPrev, cpuCur] = split(input.cpu);
	const [memPrev, memCur] = split(input.mem);

	const errRate = (e: number[], r: number[]) => (sum(r) ? (sum(e) / sum(r)) * 100 : 0);
	const cards: StatCard[] = [
		{
			key: 'requests',
			label: 'API requests (7d)',
			value: fmt(sum(reqCur)),
			detail: `${fmt(sum(reqCur) / DAYS)} / day avg`,
			trend: computeTrend(sum(reqCur), sum(reqPrev)),
		},
		{
			key: 'errors',
			label: 'Error rate (5xx)',
			value: pct(errRate(errCur, reqCur)),
			detail: `${fmt(sum(errCur))} errors`,
			trend: computeTrend(errRate(errCur, reqCur), errRate(errPrev, reqPrev), true),
		},
		{
			key: 'latency',
			label: 'Avg response time',
			value: `${fmt(avg(latCur))} ms`,
			trend: computeTrend(avg(latCur), avg(latPrev), true),
		},
	];

	const resource = (key: string, label: string, cur: number[], prev: number[], detail?: string): StatCard => {
		const current = avg(cur.filter((v) => v > 0));
		const previous = avg(prev.filter((v) => v > 0));
		return {
			key,
			label,
			value: pct(current),
			detail,
			trend: computeTrend(current, previous, true),
			percentUsed: current,
			severity: utilizationSeverity(current),
		};
	};
	const resources = [
		resource('cpu', 'CPU usage', cpuCur, cpuPrev),
		resource('memory', 'RAM usage', memCur, memPrev, input.memDetail),
	];
	if (input.storage) {
		const [sPrev, sCur] = split(input.storage);
		resources.push(resource('storage', 'Storage usage', sCur, sPrev, input.storageDetail));
	}
	return { cards, resources };
}

async function build(): Promise<MetricsDashboard> {
	let note: string | undefined;
	try {
		const cfg = await cloudWatchConfig();
		if (cfg) {
			const s = await fetchCloudWatchSeries(cfg);
			const storage = s.stu.map((u, i) => (s.str[i] ? (u / s.str[i]) * 100 : 0));
			const { cards, resources } = buildCards({
				req: s.req,
				err: s.err,
				latMs: s.lat.map((v) => v * 1000),
				cpu: s.cpu,
				mem: s.mem,
				storage: storage.some((v) => v > 0) ? storage : null,
			});
			return finish('cloudwatch', cards, resources, s.dates.slice(DAYS).map((date, i) => ({
				date,
				requests: s.req[DAYS + i],
				errors: s.err[DAYS + i],
				avgLatencyMs: Math.round(s.lat[DAYS + i] * 1000),
			})));
		}
		note = 'CloudWatch not configured; showing this instance’s in-process data since it started.';
	} catch (error) {
		note = `CloudWatch unavailable (${error instanceof Error ? error.name : 'error'}); showing in-process data.`;
	}

	const series = getDailySeries(DAYS * 2);
	const snap = await getResourceSnapshot();
	const flat = (v: number) => series.map(() => v);
	const { cards, resources } = buildCards({
		req: series.map((d) => d.requests),
		err: series.map((d) => d.errors),
		latMs: series.map((d) => d.avgLatencyMs),
		cpu: flat(snap.cpuPercent),
		mem: flat(snap.memoryPercent),
		storage: snap.storagePercent === null ? null : flat(snap.storagePercent),
		storageDetail: snap.storageUsedGb === null ? undefined : `${snap.storageUsedGb} / ${snap.storageTotalGb} GB`,
		memDetail: `${snap.memoryUsedMb} / ${snap.memoryTotalMb} MB`,
	});
	return finish('process', cards, resources, series.slice(DAYS), note);
}

function finish(
	source: MetricsDashboard['source'],
	cards: StatCard[],
	resources: StatCard[],
	daily: DailyPoint[],
	note?: string,
): MetricsDashboard {
	const top = [...resources].sort((a, b) => (b.percentUsed ?? 0) - (a.percentUsed ?? 0))[0];
	return {
		source,
		generatedAt: new Date().toISOString(),
		note,
		daily,
		cards,
		resources,
		scaleFirst: top
			? { label: top.label, percentUsed: top.percentUsed ?? 0, severity: top.severity ?? 'ok' }
			: null,
	};
}

export async function getDashboard(): Promise<MetricsDashboard> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
	const value = await build();
	cache = { at: Date.now(), value };
	return value;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCards } from './cloudwatch-metrics';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('metrics aggregation', () => {
	it('uses duration sums and sample counts rather than averaging daily averages', () => {
		const zeros = Array<number>(7).fill(0);
		const { cards } = buildCards({
			req: [...zeros, 100, 1, 0, 0, 0, 0, 0],
			err: [...zeros, ...zeros],
			latMs: [...zeros, 1000, 1000, 0, 0, 0, 0, 0],
			latSamples: [...zeros, 100, 1, 0, 0, 0, 0, 0],
			cpu: [], mem: [], storage: null,
		});
		expect(cards.find((card) => card.key === 'latency')?.value).toBe('20 ms');
		expect(cards[0]).toMatchObject({ label: 'HTTP requests (7d)', value: '101' });
	});

	it('handles missing samples without NaN or Infinity', () => {
		const zeros = Array<number>(14).fill(0);
		const { cards } = buildCards({ req: zeros, err: zeros, latMs: zeros, latSamples: zeros, cpu: [], mem: [], storage: null });
		expect(cards.find((card) => card.key === 'latency')?.value).toBe('0 ms');
	});

	it('coalesces concurrent CloudWatch refreshes and reuses SSM configuration', async () => {
		vi.resetModules();
		vi.stubEnv('ECS_CLUSTER', 'cluster');
		vi.stubEnv('ECS_SERVICE', 'service');
		vi.stubEnv('ALB_DIMENSION', '');
		vi.stubEnv('ALB_DIMENSION_PARAM', '/alb');
		const ssm = await import('@aws-sdk/client-ssm');
		const cw = await import('@aws-sdk/client-cloudwatch');
		const ssmSend = vi.spyOn(ssm.SSMClient.prototype, 'send').mockResolvedValue({ Parameter: { Value: 'alb' } } as never);
		const cwSend = vi.spyOn(cw.CloudWatchClient.prototype, 'send').mockResolvedValue({ MetricDataResults: [] } as never);
		const { getDashboard } = await import('./cloudwatch-metrics');
		const [first, second] = await Promise.all([getDashboard(), getDashboard()]);
		expect(first.source).toBe('cloudwatch');
		expect(first).toBe(second);
		expect(cwSend).toHaveBeenCalledTimes(1);
		expect(ssmSend).toHaveBeenCalledTimes(1);
		const query = (cwSend.mock.calls[0][0] as InstanceType<typeof cw.GetMetricDataCommand>).input;
		expect(query.MetricDataQueries).toEqual(expect.arrayContaining([
			expect.objectContaining({ Id: 'lat', MetricStat: expect.objectContaining({ Stat: 'Sum' }) }),
			expect.objectContaining({ Id: 'latn', MetricStat: expect.objectContaining({ Stat: 'SampleCount' }) }),
		]));
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
		await getDashboard();
		expect(cwSend).toHaveBeenCalledTimes(2);
		expect(ssmSend).toHaveBeenCalledTimes(1);
	});
});

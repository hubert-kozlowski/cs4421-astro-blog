import { describe, expect, it } from 'vitest';
import { GET } from './health';

describe('/api/health', () => {
	it('returns the liveness response contract', async () => {
		const response = await GET({} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		await expect(response.json()).resolves.toEqual({
			status: 'ok',
			uptime: expect.any(Number),
			timestamp: expect.any(String),
		});
	});
});

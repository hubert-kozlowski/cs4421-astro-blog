import { statfs } from 'node:fs/promises';
import os from 'node:os';

const DAY_MS = 86_400_000;
const DAYS_KEPT = 14;

interface DayBucket {
	requests: number;
	errors: number;
	totalMs: number;
}

const buckets = new Map<string, DayBucket>();

function dayKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function recordRequest(status: number, durationMs: number, now = Date.now()): void {
	const key = dayKey(now);
	const bucket = buckets.get(key) ?? { requests: 0, errors: 0, totalMs: 0 };
	bucket.requests += 1;
	if (status >= 500) bucket.errors += 1;
	bucket.totalMs += durationMs;
	buckets.set(key, bucket);
	for (const k of buckets.keys()) {
		if (k < dayKey(now - DAYS_KEPT * DAY_MS)) buckets.delete(k);
	}
}

export interface DailyPoint {
	date: string;
	requests: number;
	errors: number;
	avgLatencyMs: number;
}

/** Returns `days` consecutive daily points ending at `endMs`, oldest first. */
export function getDailySeries(days: number, endMs = Date.now()): DailyPoint[] {
	return Array.from({ length: days }, (_, i) => {
		const date = dayKey(endMs - (days - 1 - i) * DAY_MS);
		const b = buckets.get(date);
		return {
			date,
			requests: b?.requests ?? 0,
			errors: b?.errors ?? 0,
			avgLatencyMs: b && b.requests ? Math.round(b.totalMs / b.requests) : 0,
		};
	});
}

export interface ResourceSnapshot {
	cpuPercent: number;
	memoryPercent: number;
	memoryUsedMb: number;
	memoryTotalMb: number;
	storagePercent: number | null;
	storageUsedGb: number | null;
	storageTotalGb: number | null;
	uptimeSeconds: number;
}

export async function getResourceSnapshot(): Promise<ResourceSnapshot> {
	const cores = os.cpus().length || 1;
	const cpuPercent = Math.min(100, Math.round((os.loadavg()[0] / cores) * 1000) / 10);
	const rss = process.memoryUsage().rss;
	const total = os.totalmem();
	let storage: Pick<ResourceSnapshot, 'storagePercent' | 'storageUsedGb' | 'storageTotalGb'> = {
		storagePercent: null,
		storageUsedGb: null,
		storageTotalGb: null,
	};
	try {
		const s = await statfs(process.cwd());
		const totalB = s.blocks * s.bsize;
		const usedB = totalB - s.bavail * s.bsize;
		storage = {
			storagePercent: Math.round((usedB / totalB) * 1000) / 10,
			storageUsedGb: Math.round((usedB / 1e9) * 10) / 10,
			storageTotalGb: Math.round((totalB / 1e9) * 10) / 10,
		};
	} catch {
		// statfs unsupported; leave null
	}
	return {
		cpuPercent,
		memoryPercent: Math.round((rss / total) * 1000) / 10,
		memoryUsedMb: Math.round(rss / 1e6),
		memoryTotalMb: Math.round(total / 1e6),
		...storage,
		uptimeSeconds: Math.round(process.uptime()),
	};
}

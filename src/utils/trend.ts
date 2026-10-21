export interface Trend {
	percent: number | null;
	direction: 'up' | 'down' | 'flat';
	tone: 'good' | 'bad' | 'neutral';
}

/** Percent change from previous to current. `higherIsBad` flips colouring (CPU, errors, latency). */
export function computeTrend(current: number, previous: number, higherIsBad = false): Trend {
	if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
		return { percent: null, direction: 'flat', tone: 'neutral' };
	}
	const percent = Math.round(((current - previous) / previous) * 1000) / 10;
	if (percent === 0) return { percent, direction: 'flat', tone: 'neutral' };
	const direction = percent > 0 ? 'up' : 'down';
	const increased = direction === 'up';
	return { percent, direction, tone: increased === higherIsBad ? 'bad' : 'good' };
}

export type Severity = 'ok' | 'warn' | 'critical';

export function utilizationSeverity(percent: number): Severity {
	if (percent >= 85) return 'critical';
	if (percent >= 70) return 'warn';
	return 'ok';
}

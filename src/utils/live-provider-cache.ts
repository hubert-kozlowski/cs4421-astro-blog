import { log } from './logger';

interface Entry {
	value: unknown;
	fetchedAt: number;
}

const MAX_ENTRIES = 256;
const MAX_AGE_MS = 24 * 60 * 60_000;
const FAILURE_COOLDOWN_MS = 30_000;

/** Per-process cache; pending requests include validation and cache publication. */
export class LiveProviderCache {
	private entries = new Map<string, Entry>();
	private pending = new Map<string, Promise<Entry>>();
	private failures = new Map<string, number>();

	async get(
		key: string,
		load: () => Promise<unknown>,
		validate: (value: unknown) => boolean,
		ttl: number | ((value: unknown, fetchedAt: number) => number),
		background = false,
	): Promise<Entry & { stale: boolean }> {
		const now = Date.now();
		for (const [id, entry] of this.entries) {
			if (now - entry.fetchedAt >= MAX_AGE_MS) this.entries.delete(id);
		}
		for (const [id, until] of this.failures) {
			if (until <= now) this.failures.delete(id);
		}
		const cached = this.entries.get(key);
		const kind = key.startsWith('live-scoreboard-') ? 'scoreboard' : 'summary';
		if (cached && now - cached.fetchedAt < (typeof ttl === 'number' ? ttl : ttl(cached.value, cached.fetchedAt))) {
			log('info', { event: 'live_provider_cache', kind, outcome: 'hit' });
			return { ...cached, stale: false };
		}
		if (this.failures.has(key)) {
			if (cached) return { ...cached, stale: true };
			throw new Error('Live provider is in retry cooldown.');
		}
		let request = this.pending.get(key);
		if (!request) {
			const startedAt = performance.now();
			request = Promise.resolve().then(load).then((value) => {
				if (!validate(value)) throw new Error('Live provider returned an unexpected shape.');
				const entry = { value, fetchedAt: Date.now() };
				this.entries.delete(key);
				this.entries.set(key, entry);
				while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
				this.failures.delete(key);
				log('info', { event: 'live_provider_fetch', kind, outcome: 'success', durationMs: Math.round(performance.now() - startedAt) });
				return entry;
			}).catch((error: unknown) => {
				this.failures.set(key, Date.now() + FAILURE_COOLDOWN_MS);
				while (this.failures.size > MAX_ENTRIES) this.failures.delete(this.failures.keys().next().value!);
				log('warn', { event: 'live_provider_fetch', kind, outcome: 'failure', durationMs: Math.round(performance.now() - startedAt) });
				throw error;
			}).finally(() => this.pending.delete(key));
			this.pending.set(key, request);
		}
		if (background && cached) {
			// Observe failures even though the caller does not wait for this refresh.
			void request.catch(() => {});
			return { ...cached, stale: true };
		}
		try {
			return { ...await request, stale: false };
		} catch (error) {
			if (cached) return { ...cached, stale: true };
			throw error;
		}
	}
}

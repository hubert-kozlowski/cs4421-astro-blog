export const ACTIVE_LIVE_POLL_INTERVAL_MS = 15_000;
export const NEAR_KICKOFF_POLL_INTERVAL_MS = 60_000;
export const IDLE_LIVE_POLL_INTERVAL_MS = 5 * 60_000;
const NEAR_KICKOFF_WINDOW_MS = 90 * 60_000;

interface PollingGame {
	state: string;
	kickoffAt: string;
}

export function getLivePollInterval(games: PollingGame[], now = Date.now()): number {
	if (games.some((game) => game.state === 'in_progress' || game.state === 'halftime')) {
		return ACTIVE_LIVE_POLL_INTERVAL_MS;
	}
	const soonestKickoff = Math.min(
		...games
			.filter((game) => game.state === 'scheduled')
			.map((game) => Date.parse(game.kickoffAt))
			.filter((kickoffAt) => kickoffAt > now),
	);
	if (Number.isFinite(soonestKickoff) && soonestKickoff - now <= NEAR_KICKOFF_WINDOW_MS) {
		return NEAR_KICKOFF_POLL_INTERVAL_MS;
	}
	return IDLE_LIVE_POLL_INTERVAL_MS;
}

interface CountdownSession {
	kickoffAt: string;
	matchups: string[];
}

function isCountdownSession(value: unknown): value is CountdownSession {
	return (
		typeof value === 'object' &&
		value !== null &&
		'kickoffAt' in value &&
		typeof value.kickoffAt === 'string' &&
		Number.isFinite(Date.parse(value.kickoffAt)) &&
		'matchups' in value &&
		Array.isArray(value.matchups) &&
		value.matchups.every((matchup) => typeof matchup === 'string')
	);
}

document.querySelectorAll<HTMLElement>('[data-next-session]').forEach((element) => {
	const countdown = element.querySelector<HTMLElement>('[data-countdown]');
	const kickoffTime = element.querySelector<HTMLTimeElement>('[data-kickoff-time]');
	const matchups = element.querySelector<HTMLElement>('[data-session-matchups]');
	const serializedSessions = element.dataset.sessions;
	if (!countdown || !kickoffTime || !matchups || !serializedSessions) return;

	let parsedSessions: unknown;
	try {
		parsedSessions = JSON.parse(serializedSessions);
	} catch (error) {
		console.error('Could not read the next NFL kickoff sessions.', error);
		return;
	}
	if (!Array.isArray(parsedSessions) || !parsedSessions.every(isCountdownSession)) {
		console.error('The next NFL kickoff sessions had an unexpected format.');
		return;
	}
	const sessions = parsedSessions as CountdownSession[];

	const updateCountdown = () => {
		const now = Date.now();
		const next = sessions.find((session) => Date.parse(session.kickoffAt) > now);
		if (!next) {
			countdown.textContent = 'No games scheduled';
			kickoffTime.textContent = '';
			kickoffTime.dateTime = '';
			matchups.textContent = 'Check back for the next slate';
			return;
		}

		const remaining = Date.parse(next.kickoffAt) - now;
		const totalHours = Math.floor(remaining / 3_600_000);
		const minutes = Math.floor((remaining % 3_600_000) / 60_000);
		const seconds = Math.floor((remaining % 60_000) / 1000);
		const clock = [totalHours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
		countdown.textContent = clock;
		kickoffTime.textContent = new Date(next.kickoffAt).toLocaleString(undefined, {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit',
		});
		kickoffTime.dateTime = next.kickoffAt;
		matchups.textContent = next.matchups.join(' · ');
	};

	updateCountdown();
	window.setInterval(updateCountdown, 1000);
});

export function isAbsoluteTimestamp(value: string | undefined): value is string {
	return Boolean(
		value &&
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
		Number.isFinite(Date.parse(value)),
	);
}

export function formatLocalGameTime(
	timestamp: string,
	timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
	if (!isAbsoluteTimestamp(timestamp)) throw new RangeError('Invalid absolute game kickoff timestamp.');
	return new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone,
	}).format(new Date(timestamp));
}

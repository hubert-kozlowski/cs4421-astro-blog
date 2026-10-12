const MAX_TIMEOUT_MS = 2_147_000_000;

document.querySelectorAll<HTMLElement>('[data-calendar-starts-at]').forEach((menu) => {
	const startsAt = Date.parse(menu.dataset.calendarStartsAt ?? '');
	if (!Number.isFinite(startsAt)) {
		console.error('A game calendar menu has an invalid kickoff timestamp.');
		return;
	}

	const hideAtKickoff = () => {
		const remaining = startsAt - Date.now();
		if (remaining <= 0) {
			menu.hidden = true;
			return;
		}
		window.setTimeout(hideAtKickoff, Math.min(remaining, MAX_TIMEOUT_MS));
	};

	hideAtKickoff();
});

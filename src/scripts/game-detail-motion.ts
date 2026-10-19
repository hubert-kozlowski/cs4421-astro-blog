import { animate, inView, stagger } from 'motion';

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
	const gameHero = document.querySelector<HTMLElement>('.game-hero');
	if (gameHero) {
		gameHero.dataset.motionPlayed = 'true';
		animate(
			gameHero.querySelectorAll<HTMLElement>(
				'.game-hero__title, .eyebrow, .game-hero__date, .calendar-menu, .game-matchup',
			),
			{ opacity: [0, 1], y: [10, 0] },
			{ duration: 0.46, delay: stagger(0.065), ease: 'easeOut' },
		);
	}

	document.querySelectorAll<HTMLElement>('.venue-banner').forEach((banner) => {
		inView(
			banner,
			(element) => {
				if (!(element instanceof HTMLElement)) return;
				if (element.dataset.motionPlayed) return;
				element.dataset.motionPlayed = 'true';
				animate(
					element,
					{ opacity: [0, 1], y: [10, 0] },
					{ duration: 0.5, ease: 'easeOut' },
				);

				const outline = element.querySelector<SVGPathElement>('[data-motion-stadium-outline]');
				if (outline) {
					const length = outline.getTotalLength();
					const completeOutlineLength = length + 2;
					outline.style.strokeDasharray = `${completeOutlineLength}`;
					outline.style.strokeDashoffset = `${completeOutlineLength}`;
					animate(
						outline,
						{ strokeDashoffset: [completeOutlineLength, 0] },
						{ duration: 0.85, delay: 0.12, ease: 'easeInOut' },
					);
				}

				animate(
					element.querySelectorAll<SVGPathElement>('[data-motion-yard-line]'),
					{ opacity: [0, 1] },
					{ duration: 0.32, delay: stagger(0.035), ease: 'easeOut' },
				);
			},
			{ amount: 0.2 },
		);
	});
}

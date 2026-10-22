import { animate, inView, stagger } from 'motion';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduceMotion) {
	document.querySelectorAll<HTMLElement>('[data-standings-card]').forEach((card) => {
		const list = card.querySelector<HTMLElement>('.record-list');
		if (!list) return;

		inView(
			list,
			(element) => {
				const rows = element.querySelectorAll<HTMLElement>('li');
				const rowEntrance = animate(
					rows,
					{ opacity: [0.65, 1], y: [8, 0] },
					{ duration: 0.4, delay: stagger(0.055), ease: 'easeOut' },
				);
				const bars = element.querySelectorAll<HTMLElement>('.record-list__bar > span');
				const barEntrance = animate(
					bars,
					{ scaleX: [0.15, 1] },
					{ duration: 0.65, delay: stagger(0.055), ease: 'easeOut' },
				);
				bars.forEach((bar) => {
					bar.style.transformOrigin = 'left center';
				});

				return () => {
					rowEntrance.stop();
					barEntrance.stop();
				};
			},
			{ amount: 0.1 },
		);
	});
}

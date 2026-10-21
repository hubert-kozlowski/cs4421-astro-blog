import { formatLocalGameTime } from '../utils/local-game-time';

document.querySelectorAll<HTMLTimeElement>('time[data-device-date]').forEach((element) => {
	element.textContent = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(new Date(element.dateTime));
});

document.querySelectorAll<HTMLTimeElement>('time[data-device-time]').forEach((element) => {
	element.textContent = formatLocalGameTime(element.dateTime);
});

document.querySelectorAll<HTMLTimeElement>('time[data-device-game-date]').forEach((element) => {
	element.textContent = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	})
		.format(new Date(element.dateTime))
		.replace(',', ' ·')
		.toLocaleUpperCase();
});

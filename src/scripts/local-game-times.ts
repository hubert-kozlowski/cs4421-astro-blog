import { formatLocalGameTime } from '../utils/local-game-time';

document.querySelectorAll<HTMLTimeElement>('time[data-device-time]').forEach((element) => {
	element.textContent = formatLocalGameTime(element.dateTime);
});

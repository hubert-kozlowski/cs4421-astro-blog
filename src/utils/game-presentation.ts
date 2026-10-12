const POSTSEASON_GAME_TYPES = new Set(['WC', 'WILD', 'WILDCARD', 'DIV', 'CON', 'SB', 'POST']);

export function getMatchupTypeLabel(gameType?: string | null, isDivisionGame = false): string {
	const normalizedType = gameType?.toUpperCase();
	if (POSTSEASON_GAME_TYPES.has(normalizedType ?? '')) return 'Postseason';
	if (normalizedType === 'PRE') return 'Preseason';
	if (normalizedType === undefined || normalizedType === '' || normalizedType === 'REG') {
		return isDivisionGame ? 'Division game' : 'Regular season';
	}
	return `Game type ${normalizedType}`;
}

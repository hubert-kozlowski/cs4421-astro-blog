const ESPN_ATHLETE_IDS: Record<string, string> = {
	'patrick mahomes': '3139477',
	'josh allen': '3918298',
	'lamar jackson': '3916387',
	'joe burrow': '3915511',
	'jalen hurts': '4040715',
	'justin herbert': '4038941',
	'justin jefferson': '4262921',
	'ja marr chase': '4362628',
	'ceedee lamb': '4241389',
	'saquon barkley': '3929630',
	'christian mccaffrey': '3117251',
	'derrick henry': '3043078',
};

function normalizedName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * ESPN's athlete CDN gives us a direct image URL. The mapping is curated while
 * the player directory has no ESPN athlete ID; unavailable images fall back to
 * the local avatar component.
 */
export function getEspnHeadshotUrl(name: string): string | undefined {
	const athleteId = ESPN_ATHLETE_IDS[normalizedName(name)];
	return athleteId ? `https://a.espncdn.com/i/headshots/nfl/players/full/${athleteId}.png` : undefined;
}

export interface TeamColorPalette {
	primary: string;
	accent: string;
	ink?: string;
}

export const TEAM_COLORS: Record<string, TeamColorPalette> = {
	ARI: { primary: '#97233f', accent: '#ffb612' },
	ATL: { primary: '#a71930', accent: '#a5acaf' },
	BAL: { primary: '#241773', accent: '#9e7c0c' },
	BUF: { primary: '#00338d', accent: '#c60c30' },
	CAR: { primary: '#0085ca', accent: '#101820' },
	CHI: { primary: '#0b162a', accent: '#c83803' },
	CIN: { primary: '#fb4f14', accent: '#111111' },
	CLE: { primary: '#311d00', accent: '#ff3c00' },
	DAL: { primary: '#003594', accent: '#869397' },
	DEN: { primary: '#fb4f14', accent: '#002244' },
	DET: { primary: '#0076b6', accent: '#b0b7bc' },
	GB: { primary: '#203731', accent: '#ffb612' },
	HOU: { primary: '#03202f', accent: '#a71930' },
	IND: { primary: '#002c5f', accent: '#a2aaad' },
	JAX: { primary: '#006778', accent: '#d7a22a' },
	KC: { primary: '#e31837', accent: '#ffb81c' },
	LA: { primary: '#003594', accent: '#ffa300' },
	LAC: { primary: '#0080c6', accent: '#ffc20e' },
	LAR: { primary: '#003594', accent: '#ffa300' },
	LV: { primary: '#111111', accent: '#a5acaf' },
	MIA: { primary: '#008e97', accent: '#fc4c02' },
	MIN: { primary: '#4f2683', accent: '#ffc62f' },
	NE: { primary: '#002244', accent: '#c60c30' },
	NO: { primary: '#d3bc8d', accent: '#111111', ink: '#17191f' },
	NYG: { primary: '#0b2265', accent: '#a71930' },
	NYJ: { primary: '#125740', accent: '#ffffff' },
	OAK: { primary: '#111111', accent: '#a5acaf' },
	PHI: { primary: '#004c54', accent: '#a5acaf' },
	PHX: { primary: '#97233f', accent: '#ffb612' },
	PIT: { primary: '#ffb612', accent: '#111111', ink: '#17191f' },
	RAI: { primary: '#111111', accent: '#a5acaf' },
	SD: { primary: '#0080c6', accent: '#ffc20e' },
	SEA: { primary: '#002244', accent: '#69be28' },
	SF: { primary: '#aa0000', accent: '#b3995d' },
	SLC: { primary: '#97233f', accent: '#ffb612' },
	STL: { primary: '#003594', accent: '#ffa300' },
	TB: { primary: '#d50a0a', accent: '#34302b' },
	TEN: { primary: '#0c2340', accent: '#4b92db' },
	WAS: { primary: '#5a1414', accent: '#ffb612' },
	WSH: { primary: '#5a1414', accent: '#ffb612' },
};

export function teamPalette(abbr: string): TeamColorPalette | undefined {
	return TEAM_COLORS[abbr.toUpperCase()];
}

export type SportId = 'nfl' | 'cfb';

export interface SportCapabilities {
	players: boolean;
	compare: boolean;
	liveScores: boolean;
	calendar: boolean;
}

export interface SportDefinition {
	id: SportId;
	name: string;
	shortName: string;
	status: 'active' | 'planned';
	accent: 'red' | 'blue';
	capabilities: SportCapabilities;
}

export const DEFAULT_SPORT: SportId = 'nfl';

export const SPORTS: Readonly<Record<SportId, SportDefinition>> = {
	nfl: {
		id: 'nfl',
		name: 'National Football League',
		shortName: 'NFL',
		status: 'active',
		accent: 'red',
		capabilities: {
			players: true,
			compare: true,
			liveScores: true,
			calendar: true,
		},
	},
	cfb: {
		id: 'cfb',
		name: 'College Football',
		shortName: 'CFB',
		status: 'planned',
		accent: 'blue',
		capabilities: {
			players: false,
			compare: false,
			liveScores: false,
			calendar: false,
		},
	},
};

export function getSportDefinition(sport: SportId = DEFAULT_SPORT): SportDefinition {
	return SPORTS[sport];
}


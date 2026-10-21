import { DEFAULT_SPORT, type SportId } from '../config/sports';
import {
	getDashboardData,
	type ApiResult,
	type NflDashboardData,
	type NflGame,
	type NflTeam,
	type TeamRecord,
} from './nfl-data';

export type FootballGame = NflGame;
export type FootballTeam = NflTeam;
export type FootballRecord = TeamRecord;
export type FootballDashboardData = NflDashboardData;

export interface SportDataProvider {
	id: SportId;
	getDashboard(week?: number): Promise<ApiResult<FootballDashboardData>>;
}

export class SportProviderUnavailableError extends Error {
	constructor(sport: SportId) {
		super(`No data provider is registered for ${sport}.`);
		this.name = 'SportProviderUnavailableError';
	}
}

const providers: Partial<Record<SportId, SportDataProvider>> = {
	nfl: {
		id: 'nfl',
		getDashboard: getDashboardData,
	},
};

export function getSportProvider(sport: SportId = DEFAULT_SPORT): SportDataProvider {
	const provider = providers[sport];
	if (!provider) throw new SportProviderUnavailableError(sport);
	return provider;
}


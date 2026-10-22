import { describe, expect, it } from 'vitest';
import {
	buildTeamRecords,
	currentNflSeason,
	getGameBroadcastLabel,
	getGameStatus,
	getMissingFinalScoreDays,
	getGameUpset,
	getDefaultWeek,
	getCountdownGames,
	getUpcomingGames,
	makeDashboard,
	mergeEspnFinalScores,
	nearestPlayerMatches,
	rankPlayers,
	selectPlayerSeasonStats,
	sortGamesByKickoffAndShock,
	type NflGame,
	type NflPlayer,
	type NflPlayerSeasonStats,
	type NflTeam,
} from './nfl-data';
import { TEAM_COLORS, teamPalette } from './team-colors';
import { formatLocalGameTime, isAbsoluteTimestamp } from './local-game-time';

const teams: NflTeam[] = [
	{ abbr: 'BUF', name: 'Buffalo Bills', conf: 'AFC', division: 'AFC East' },
	{ abbr: 'KC', name: 'Kansas City Chiefs', conf: 'AFC', division: 'AFC West' },
];

const games: NflGame[] = [
	{
		game_id: '2026_01_BUF_KC',
		season: 2026,
		week: 1,
		game_type: 'REG',
		gameday: '2026-09-10',
		home_team: 'KC',
		away_team: 'BUF',
		home_score: 24,
		away_score: 24,
	},
	{
		game_id: '2026_02_BUF_KC',
		season: 2026,
		week: 2,
		game_type: 'REG',
		gameday: '2026-09-17',
		home_team: 'KC',
		away_team: 'BUF',
		home_score: 21,
		away_score: 17,
	},
	{
		game_id: '2026_03_BUF_KC',
		season: 2026,
		week: 3,
		game_type: 'REG',
		gameday: '2026-09-24',
		home_team: 'KC',
		away_team: 'BUF',
		home_score: null,
		away_score: null,
	},
	{
		game_id: '2026_20_BUF_KC',
		season: 2026,
		week: 20,
		game_type: 'DIV',
		gameday: '2027-01-20',
		home_team: 'KC',
		away_team: 'BUF',
		home_score: 30,
		away_score: 10,
	},
];

describe('NFL season data helpers', () => {
	it('keeps conference teams individually recognizable with unique current palettes', () => {
		expect(teamPalette('KC')?.primary).toBe('#e31837');
		expect(teamPalette('BAL')?.primary).toBe('#241773');
		expect(teamPalette('BUF')?.primary).toBe('#00338d');
		expect(new Set([TEAM_COLORS.KC?.primary, TEAM_COLORS.BAL?.primary, TEAM_COLORS.BUF?.primary]).size).toBe(3);
		expect(teamPalette('WSH')).toEqual(teamPalette('WAS'));
	});

	it('selects the newest regular-season stats available through the current season', () => {
		const seasons: NflPlayerSeasonStats[] = [
			{ player_id: 'player', player_name: 'P.Player', season: 2024, season_type: 'REG', games: 16 },
			{ player_id: 'player', player_name: 'P.Player', season: 2025, season_type: 'REG', games: 14 },
			{ player_id: 'player', player_name: 'P.Player', season: 2025, season_type: 'POST', games: 2 },
			{ player_id: 'player', player_name: 'P.Player', season: 2026, season_type: 'REG', games: 4 },
		];

		expect(selectPlayerSeasonStats(seasons, 2026)?.season).toBe(2026);
		expect(selectPlayerSeasonStats(seasons.filter((stats) => stats.season < 2026), 2026)?.season).toBe(2025);
		expect(selectPlayerSeasonStats(seasons, 2025)?.season).toBe(2025);
	});

	it('finds nearest players with misspellings and adjacent letter transpositions', () => {
		const players: NflPlayer[] = [
			{ gsis_id: 'mahomes', display_name: 'Patrick Mahomes' },
			{ gsis_id: 'brady', display_name: 'Tom Brady' },
			{ gsis_id: 'rodgers', display_name: 'Aaron Rodgers' },
		];

		expect(nearestPlayerMatches('Pattrick Mahmoes', players).map((player) => player.gsis_id)).toEqual([
			'mahomes',
		]);
	});

	it('ranks active, prominent players ahead of obscure namesakes', () => {
		const players: NflPlayer[] = [
			{ gsis_id: 'a', display_name: 'Josh Allen', position: 'LB', status: 'RET', years_exp: 2 },
			{ gsis_id: 'b', display_name: 'Josh Allen', position: 'QB', status: 'ACT', years_exp: 8, draft_round: 1, draft_pick: 7 },
			{ gsis_id: 'c', display_name: 'Joshua Allen', position: 'WR', status: 'ACT', years_exp: 1 },
		];

		expect(rankPlayers('Josh Allen', players).map((player) => player.gsis_id)).toEqual(['b', 'a', 'c']);
	});

	it('does not suggest a player when only one token is similar', () => {
		const players: NflPlayer[] = [{ gsis_id: 'mahomes', display_name: 'Patrick Mahomes' }];

		expect(nearestPlayerMatches('Patrick Rodgers', players)).toEqual([]);
	});

	it('calculates regular-season records from final scores only', () => {
		expect(buildTeamRecords(games, teams, new Date('2026-09-30T12:00:00Z'))).toEqual([
			expect.objectContaining({
				abbr: 'KC',
				wins: 1,
				losses: 0,
				ties: 1,
				gamesPlayed: 2,
				winPercentage: 0.75,
			}),
			expect.objectContaining({
				abbr: 'BUF',
				wins: 0,
				losses: 1,
				ties: 1,
				gamesPlayed: 2,
				winPercentage: 0.25,
			}),
		]);
	});

	it('chooses the first not-yet-played regular-season week', () => {
		expect(getDefaultWeek(games, new Date('2026-09-15T10:00:00Z'))).toBe(2);
	});

	it('falls back to the final regular-season week when the season is over', () => {
		expect(getDefaultWeek(games, new Date('2027-02-01T10:00:00Z'))).toBe(3);
	});

	it('does not add same-day scores to official records without final status', () => {
		const gameInProgress = {
			...games[0],
			gameday: '2026-09-30',
			home_score: 14,
			away_score: 10,
		};
		expect(buildTeamRecords([gameInProgress], teams, new Date('2026-09-30T12:00:00Z'))).toEqual([]);
	});

	it('requests scoreboards for every past date that is missing a final score', () => {
		expect(
			getMissingFinalScoreDays(
				[
					{ ...games[0], gameday: '2026-09-12', home_score: null, away_score: null },
					{ ...games[1], gameday: '2026-09-12', home_score: 21, away_score: 17 },
					{ ...games[2], gameday: '2026-09-19', home_score: null, away_score: null },
					{ ...games[2], gameday: '2026-09-30', home_score: null, away_score: null },
				],
				new Date('2026-09-30T12:00:00Z'),
			),
		).toEqual(['2026-09-12', '2026-09-19']);
	});

	it('keeps January and February attached to the prior NFL season', () => {
		expect(currentNflSeason(new Date('2027-01-15T12:00:00Z'))).toBe(2026);
		expect(currentNflSeason(new Date('2027-03-15T12:00:00Z'))).toBe(2027);
	});

	it('marks an earlier game without published scores as result pending', () => {
		const game = { ...games[0], gameday: '2026-10-08', home_score: null, away_score: null };

		expect(getGameStatus(game, new Date('2026-10-11T12:00:00Z'))).toBe('Result pending');
		expect(getGameStatus({ ...game, gameday: '2026-10-11' }, new Date('2026-10-11T12:00:00Z'))).toBe(
			'Scheduled',
		);
		expect(getGameStatus({ ...game, home_score: 24, away_score: 21 }, new Date('2026-10-11T12:00:00Z'))).toBe(
			'Final',
		);
	});

	it('fills missing past-game scores from a matching final scoreboard event', () => {
		const game = {
			...games[0],
			game_id: '2026_05_TB_DAL',
			gameday: '2026-10-08',
			home_team: 'DAL',
			away_team: 'TB',
			home_score: null,
			away_score: null,
		};
		const scoreboard = {
			events: [
				{
					date: '2026-10-09T00:15Z',
					competitions: [
						{
							status: { type: { completed: true, name: 'STATUS_FINAL' } },
							competitors: [
								{ team: { abbreviation: 'DAL' }, score: '16', homeAway: 'home' },
								{ team: { abbreviation: 'TB' }, score: '24', homeAway: 'away' },
							],
						},
					],
				},
			],
		};

		expect(mergeEspnFinalScores([game], scoreboard)[0]).toMatchObject({
			game_id: '2026_05_TB_DAL',
			home_score: 16,
			away_score: 24,
		});
	});

	it('uses only an absolute provider timestamp for kickoff time', () => {
		const game = {
			...games[0],
			gameday: '2026-10-08',
			kickoff_at: null,
		};
		const validScoreboard = {
			events: [
				{
					date: '2026-10-09T00:15:00Z',
					competitions: [
						{
							date: '2026-10-09T00:15:00Z',
							status: { type: { completed: false, name: 'STATUS_SCHEDULED' } },
							competitors: [
								{ team: { abbreviation: 'KC' }, score: '0', homeAway: 'home' },
								{ team: { abbreviation: 'BUF' }, score: '0', homeAway: 'away' },
							],
						},
					],
				},
			],
		};
		const invalidScoreboard = {
			events: [
				{
					date: '2026-10-09',
					competitions: [
						{
							date: '2026-10-09 00:15',
							status: { type: { completed: false, name: 'STATUS_SCHEDULED' } },
							competitors: [
								{ team: { abbreviation: 'KC' }, score: '0', homeAway: 'home' },
								{ team: { abbreviation: 'BUF' }, score: '0', homeAway: 'away' },
							],
						},
					],
				},
			],
		};

		expect(mergeEspnFinalScores([game], validScoreboard)[0]?.kickoff_at).toBe('2026-10-09T00:15:00Z');
		expect(mergeEspnFinalScores([game], invalidScoreboard)[0]?.kickoff_at).toBeNull();
		expect(isAbsoluteTimestamp('2026-10-09T00:15:00Z')).toBe(true);
		expect(isAbsoluteTimestamp('2026-10-09 00:15')).toBe(false);
		expect(isAbsoluteTimestamp(undefined)).toBe(false);
	});

	it('formats kickoff time in the requested device timezone across local date boundaries', () => {
		const timezone = 'America/Los_Angeles';
		const kickoff = '2026-10-12T00:30:00Z';
		const expectedLocalTime = new Intl.DateTimeFormat(undefined, {
			timeZone: timezone,
			hour: 'numeric',
			minute: '2-digit',
		}).format(new Date(kickoff));
		const localTime = formatLocalGameTime(kickoff, timezone);

		expect(localTime).toBe(expectedLocalTime);
		expect(localTime).not.toMatch(/Oct|Sun|GMT|UTC|EDT|EST|PDT|PST/);
		expect(() => formatLocalGameTime('2026-10-12 00:30', timezone)).toThrow(
			'Invalid absolute game kickoff timestamp.',
		);
	});

	it('does not apply scores from unfinished or mismatched games', () => {
		const game = {
			...games[0],
			gameday: '2026-10-08',
			home_score: null,
			away_score: null,
		};
		const scoreboard = {
			events: [
				{
					date: '2026-10-08T20:00Z',
					competitions: [
						{
							status: { type: { completed: false, name: 'STATUS_IN_PROGRESS' } },
							competitors: [
								{ team: { abbreviation: 'KC' }, score: '21', homeAway: 'home' },
								{ team: { abbreviation: 'BUF' }, score: '17', homeAway: 'away' },
							],
						},
					],
				},
			],
		};

		expect(mergeEspnFinalScores([game], scoreboard)[0]).toMatchObject({
			home_score: null,
			away_score: null,
		});
	});

	it('orders same-kickoff games by underdog upset magnitude', () => {
		const kickoff_at = '2026-10-11T17:00:00Z';
		const gamesAtKickoff: NflGame[] = [
			{
				...games[0],
				game_id: 'favorite-win',
				kickoff_at,
				spread_line: 7,
				home_score: 24,
				away_score: 17,
			},
			{
				...games[0],
				game_id: 'big-upset',
				kickoff_at,
				spread_line: -7,
				home_score: 24,
				away_score: 17,
			},
			{
				...games[0],
				game_id: 'small-upset',
				kickoff_at,
				spread_line: 3.5,
				home_score: 17,
				away_score: 20,
			},
			{ ...games[0], game_id: 'earlier', kickoff_at: '2026-10-11T13:30:00Z' },
		];

		expect(sortGamesByKickoffAndShock(gamesAtKickoff).map((game) => game.game_id)).toEqual([
			'earlier',
			'big-upset',
			'small-upset',
			'favorite-win',
		]);
		expect(getGameUpset(gamesAtKickoff[1]!)).toEqual({ team: 'KC', spread: 7 });
	});

	it('counts down only to future scheduled kickoff times in the next eight days', () => {
		const scheduled: NflGame[] = [
			{ ...games[0], game_id: 'past', kickoff_at: '2026-10-11T13:30:00Z', home_score: null, away_score: null },
			{ ...games[0], game_id: 'next', kickoff_at: '2026-10-11T17:00:00Z', home_score: null, away_score: null },
			{ ...games[0], game_id: 'scored', kickoff_at: '2026-10-11T20:00:00Z', home_score: 14 },
			{ ...games[0], game_id: 'too-far', kickoff_at: '2026-10-20T17:00:00Z' },
			{ ...games[0], game_id: 'unknown', kickoff_at: null },
		];

		expect(
			getCountdownGames(scheduled, new Date('2026-10-11T14:00:00Z')).map((game) => game.game_id),
		).toEqual(['next']);
	});

	it('returns a small upcoming schedule in date order, excluding older and scored games', () => {
		const schedule: NflGame[] = [
			{ ...games[0], game_id: 'old', gameday: '2026-10-08', home_score: null, away_score: null },
			{ ...games[0], game_id: 'later', gameday: '2026-10-15', home_score: null, away_score: null },
			{ ...games[0], game_id: 'tomorrow', gameday: '2026-10-12', home_score: null, away_score: null },
			{ ...games[0], game_id: 'today', gameday: '2026-10-11', home_score: null, away_score: null },
			{ ...games[0], game_id: 'scored', gameday: '2026-10-12', home_score: 7, away_score: null },
			{
				...games[0],
				game_id: 'postseason',
				game_type: 'POST',
				gameday: '2026-10-11',
				home_score: null,
				away_score: null,
			},
		];

		expect(getUpcomingGames(schedule, new Date('2026-10-11T12:00:00Z'), 3).map((game) => game.game_id)).toEqual([
			'today',
			'tomorrow',
			'later',
		]);
	});

	it('labels Thursday, Monday, and scheduled Sunday night games', () => {
		expect(getGameBroadcastLabel({ ...games[0], gameday: '2026-10-15' })).toBe('Thursday Night Football');
		expect(getGameBroadcastLabel({ ...games[0], gameday: '2026-10-12' })).toBe('Monday Night Football');
		expect(getGameBroadcastLabel({ ...games[0], gameday: '2026-10-11', gametime: '20:20' })).toBe(
			'Sunday Night Football',
		);
		expect(getGameBroadcastLabel({ ...games[0], gameday: '2026-10-11' })).toBeUndefined();
	});

	it('uses a valid selected week and returns schedule weeks without postseason games', () => {
		const dashboard = makeDashboard(2026, games, teams, 2, new Date('2026-09-30T12:00:00Z'));

		expect(dashboard.week).toBe(2);
		expect(dashboard.availableWeeks).toEqual([1, 2, 3]);
		expect(dashboard.games.map((game) => game.game_id)).toEqual(['2026_02_BUF_KC']);
		expect(dashboard.teams.map((team) => team.abbr)).toEqual(['BUF', 'KC']);
	});

	it('keeps schedule teams available to filters when team metadata is unavailable', () => {
		const dashboard = makeDashboard(2026, games, [], 2, new Date('2026-09-30T12:00:00Z'));

		expect(dashboard.teams).toEqual([
			{ abbr: 'BUF', name: 'BUF', conf: '', division: '' },
			{ abbr: 'KC', name: 'KC', conf: '', division: '' },
		]);
	});
});

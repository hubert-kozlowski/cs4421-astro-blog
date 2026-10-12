import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';

const now = new Date();
const dateOnly = (date) => date.toISOString().slice(0, 10);
const kickoffAt = (offsetDays) => {
	const date = new Date(now);
	date.setUTCDate(date.getUTCDate() + offsetDays);
	date.setUTCHours(19, 0, 0, 0);
	return date;
};
const previousGameDate = new Date(now);
previousGameDate.setUTCDate(previousGameDate.getUTCDate() - 3);
const previousDay = dateOnly(previousGameDate);
const upcomingKickoff = kickoffAt(2);
const upcomingDay = dateOnly(upcomingKickoff);
const season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();

const divisions = [
	['AFC', 'East', ['BUF', 'MIA', 'NE', 'NYJ']],
	['AFC', 'North', ['BAL', 'CIN', 'CLE', 'PIT']],
	['AFC', 'South', ['HOU', 'IND', 'JAX', 'TEN']],
	['AFC', 'West', ['DEN', 'KC', 'LV', 'LAC']],
	['NFC', 'East', ['DAL', 'NYG', 'PHI', 'WSH']],
	['NFC', 'North', ['CHI', 'DET', 'GB', 'MIN']],
	['NFC', 'South', ['ATL', 'CAR', 'NO', 'TB']],
	['NFC', 'West', ['ARI', 'LA', 'SF', 'SEA']],
];
const names = {
	ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
	CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
	DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
	HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
	LA: 'Los Angeles Rams', LAC: 'Los Angeles Chargers', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
	MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
	NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers',
	SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WSH: 'Washington Commanders',
};
const teams = divisions.flatMap(([conf, division, abbreviations]) =>
	abbreviations.map((abbr) => ({
		abbr,
		name: names[abbr],
		conf,
		division: `${conf} ${division}`,
	})),
);

const games = [
	{
		game_id: 'past-game-no-kickoff',
		season,
		week: 6,
		game_type: 'REG',
		gameday: previousDay,
		home_team: 'KC',
		away_team: 'BUF',
		home_score: 24,
		away_score: 17,
		stadium: 'Arrowhead Stadium',
	},
	{
		game_id: 'live-link-target',
		season,
		week: 6,
		game_type: 'REG',
		gameday: '2026-10-11',
		gametime: '1:00PM',
		kickoff_at: '2026-10-11T13:00:00.000Z',
		home_team: 'JAX',
		away_team: 'PHI',
		home_score: 17,
		away_score: 13,
		stadium: 'EverBank Stadium',
	},
	{
		game_id: 'example-game',
		season,
		week: 6,
		game_type: 'REG',
		gameday: upcomingDay,
		gametime: '8:00PM',
		kickoff_at: upcomingKickoff.toISOString(),
		home_team: 'JAX',
		away_team: 'PHI',
		home_score: null,
		away_score: null,
		stadium: 'EverBank Stadium',
	},
];

const players = [
	{ gsis_id: '00-0033873', display_name: 'Patrick Mahomes', first_name: 'Patrick', last_name: 'Mahomes', position: 'QB', college: 'Texas Tech', years_exp: 9 },
	{ gsis_id: '00-0036212', display_name: 'James Cook', first_name: 'James', last_name: 'Cook', position: 'RB', college: 'Georgia', years_exp: 4 },
];
const playerStats = {
	'00-0033873': [
		{ player_id: '00-0033873', player_name: 'P.Mahomes', player_display_name: 'Patrick Mahomes', position: 'QB', season, season_type: 'REG', recent_team: 'KC', games: 6, completions: 145, attempts: 210, passing_yards: 1037, passing_tds: 9, passing_interceptions: 3, rushing_yards: 90 },
	],
	'00-0036212': [
		{ player_id: '00-0036212', player_name: 'J.Cook', player_display_name: 'James Cook', position: 'RB', season: season - 1, season_type: 'REG', recent_team: 'BUF', games: 17, carries: 250, rushing_yards: 2660, rushing_tds: 16 },
	],
};

function paginated(data) {
	return { data, total: data.length, limit: 1000, offset: 0 };
}

function playerResponse(name) {
	const normalized = name.toLowerCase();
	const data = players.filter((player) => player.display_name.toLowerCase().includes(normalized));
	return paginated(data);
}

function responseFor(path, searchParams) {
	if (path === '/espn/scoreboard') return { events: [] };
	if (path === '/v1/meta') return { seasons: [season, season - 1], teams };
	if (path === '/v1/games' && searchParams.has('season')) return paginated(games);
	if (path === '/v1/games/head-to-head') {
		const team1 = searchParams.get('team1');
		const team2 = searchParams.get('team2');
		return {
			team1,
			team2,
			total_games: 1,
			record: {
				[team1]: { wins: 1, losses: 0, ties: 0 },
				[team2]: { wins: 0, losses: 1, ties: 0 },
			},
			games: [games[0]],
		};
	}
	if (path.startsWith('/v1/games/')) {
		const gameId = decodeURIComponent(path.slice('/v1/games/'.length));
		const game = games.find((candidate) => candidate.game_id === gameId) ?? games[1];
		return game;
	}
	if (path === '/v1/players' && searchParams.has('name')) {
		return playerResponse(searchParams.get('name') ?? '');
	}
	if (path.startsWith('/v1/players/')) {
		const playerId = decodeURIComponent(path.slice('/v1/players/'.length));
		return players.find((player) => player.gsis_id === playerId) ?? {
			gsis_id: playerId,
			display_name: 'Test NFL Player',
			position: 'QB',
		};
	}
	if (path === '/v1/stats/season') {
		return paginated(playerStats[searchParams.get('player_id')] ?? []);
	}
	return { error: `No Playwright fixture for ${path}` };
}

const provider = createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://127.0.0.1:4322');
	const payload = responseFor(url.pathname, url.searchParams);
	response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(payload));
});

const dataDirectory = await mkdtemp(join(tmpdir(), 'gridiron-playwright-'));
process.env.NFL_DATA_DIR = dataDirectory;
await new Promise((resolve) => provider.listen(4322, '127.0.0.1', resolve));
const app = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4331', '--ignore-lock'], {
	stdio: 'inherit',
	env: process.env,
});

function shutdown() {
	provider.close();
	if (app.exitCode === null) app.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
app.on('exit', async (code) => {
	provider.close();
	await rm(dataDirectory, { recursive: true, force: true });
	process.exit(code ?? 1);
});

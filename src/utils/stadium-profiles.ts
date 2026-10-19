export interface StadiumProfile {
	venue: string;
	outline: string;
}

const stadiumProfiles: Readonly<Record<string, StadiumProfile>> = {
	ARI: {
		venue: 'State Farm Stadium',
		outline: 'M56 26h248q20 0 29 21l13 38q8 23-2 48l-10 25q-8 15-28 15H55q-20 0-28-18l-9-29q-7-23 1-46l12-37q7-17 25-17Z',
	},
	ATL: {
		venue: 'Mercedes-Benz Stadium',
		outline: 'M180 18 302 38l38 42v40l-38 42-122 20-122-20-38-42V80l38-42Z',
	},
	BAL: {
		venue: 'M&T Bank Stadium',
		outline: 'M54 22h252l26 19v108l-26 19H54l-26-19V41Z',
	},
	BUF: {
		venue: 'Highmark Stadium',
		outline: 'M49 32q15-13 38-13h186q23 0 38 13l28 26v72l-28 26q-15 13-38 13H87q-23 0-38-13l-28-26V58Z',
	},
	CAR: {
		venue: 'Bank of America Stadium',
		outline: 'M59 23h242l34 29v87l-34 29H59l-34-29V52Z',
	},
	CHI: {
		venue: 'Soldier Field',
		outline: 'M57 19h246v12h27v26h-12v77h12v26h-27v12H57v-12H30v-26h12V57H30V31h27Z',
	},
	CIN: {
		venue: 'Paycor Stadium',
		outline: 'M67 23h226l39 20v17l-15 9v52l15 9v17l-39 20H67l-39-20v-17l15-9V69l-15-9V43Z',
	},
	CLE: {
		venue: 'Huntington Bank Field',
		outline: 'M41 31h278l22 26v76l-22 26H41l-22-26V57Z',
	},
	DAL: {
		venue: 'AT&T Stadium',
		outline: 'M38 25h284l15 18v104l-15 18H38l-15-18V43Z',
	},
	DEN: {
		venue: 'Empower Field at Mile High',
		outline: 'M61 22h238l32 25-12 19v55l12 19-32 25H61l-32-25 12-19V66L29 47Z',
	},
	DET: {
		venue: 'Ford Field',
		outline: 'M43 25h274l21 21v98l-21 21H43l-21-21V46Z',
	},
	GB: {
		venue: 'Lambeau Field',
		outline: 'M68 20h224q24 0 34 23l12 42v20l-12 42q-10 23-34 23H68q-24 0-34-23l-12-42V85l12-42q10-23 34-23Z',
	},
	HOU: {
		venue: 'NRG Stadium',
		outline: 'M43 25h274l21 29v82l-21 29H43l-21-29V54Z',
	},
	IND: {
		venue: 'Lucas Oil Stadium',
		outline: 'M54 23h252l26 25v96l-26 25H54l-26-25V48Z',
	},
	JAX: {
		venue: 'EverBank Stadium',
		outline: 'M45 22h270l26 24v100l-26 24H45l-26-24V46Z',
	},
	KC: {
		venue: 'GEHA Field at Arrowhead Stadium',
		outline: 'M48 22h264l31 22v22l-17 13v32l17 13v22l-31 22H48l-31-22v-22l17-13V79L17 66V44Z',
	},
	LV: {
		venue: 'Allegiant Stadium',
		outline: 'M55 24h250q25 0 34 24l10 25v48l-10 25q-9 24-34 24H55q-25 0-34-24l-10-25V73l10-25q9-24 34-24Z',
	},
	LAC: {
		venue: 'SoFi Stadium',
		outline: 'M55 20h250q36 0 45 35l-10 39v22l10 39q-9 35-45 35H55q-36 0-45-35l10-39V94L10 55q9-35 45-35Z',
	},
	LAR: {
		venue: 'SoFi Stadium',
		outline: 'M55 20h250q36 0 45 35l-10 39v22l10 39q-9 35-45 35H55q-36 0-45-35l10-39V94L10 55q9-35 45-35Z',
	},
	LA: {
		venue: 'SoFi Stadium',
		outline: 'M55 20h250q36 0 45 35l-10 39v22l10 39q-9 35-45 35H55q-36 0-45-35l10-39V94L10 55q9-35 45-35Z',
	},
	MIA: {
		venue: 'Hard Rock Stadium',
		outline: 'M49 25h262l27 24v92l-27 24H49l-27-24V49Z',
	},
	MIN: {
		venue: 'U.S. Bank Stadium',
		outline: 'M55 20h247l38 30-13 29v30l13 29-38 30H55l-38-30 13-29V79l-13-29Z',
	},
	NE: {
		venue: 'Gillette Stadium',
		outline: 'M52 26h256l28 23v92l-28 23H52l-28-23V49Z',
	},
	NO: {
		venue: 'Caesars Superdome',
		outline: 'M81 17h198q31 0 43 28l13 31v38l-13 31q-12 28-43 28H81q-31 0-43-28l-13-31V76l13-31q12-28 43-28Z',
	},
	NYG: {
		venue: 'MetLife Stadium',
		outline: 'M43 24h274l21 24v94l-21 24H43l-21-24V48Z',
	},
	NYJ: {
		venue: 'MetLife Stadium',
		outline: 'M43 24h274l21 24v94l-21 24H43l-21-24V48Z',
	},
	PHI: {
		venue: 'Lincoln Financial Field',
		outline: 'M51 21h258l30 27v93l-30 27H51l-30-27V48Z',
	},
	PIT: {
		venue: 'Acrisure Stadium',
		outline: 'M48 22h264l31 22v19l-18 11v42l18 11v19l-31 22H48l-31-22v-19l18-11V74L17 63V44Z',
	},
	SEA: {
		venue: 'Lumen Field',
		outline: 'M55 20h250l30 20v110l-30 20H55l-30-20V40Z',
	},
	SF: {
		venue: 'Levi’s Stadium',
		outline: 'M45 24h270v13h22v110h-22v13H45v-13H23V37h22Z',
	},
	TB: {
		venue: 'Raymond James Stadium',
		outline: 'M52 23h256l30 26v92l-30 26H52l-30-26V49Z',
	},
	TEN: {
		venue: 'Nissan Stadium',
		outline: 'M58 22h244l34 24v19l-20 14v30l20 14v19l-34 24H58l-34-24v-19l20-14V79L24 65V46Z',
	},
	WAS: {
		venue: 'Northwest Stadium',
		outline: 'M48 25h263l26 23v94l-26 23H48l-26-23V48Z',
	},
	WSH: {
		venue: 'Northwest Stadium',
		outline: 'M48 25h263l26 23v94l-26 23H48l-26-23V48Z',
	},
};

export function getStadiumProfile(abbreviation: string | null | undefined): StadiumProfile {
	const key = abbreviation?.trim().toUpperCase() ?? '';
	return stadiumProfiles[key] ?? {
		venue: 'Football stadium',
		outline: 'M48 28h264a25 25 0 0 1 25 25v82a25 25 0 0 1-25 25H48a25 25 0 0 1-25-25V53a25 25 0 0 1 25-25Z',
	};
}

export const NFL_TEAM_STADIUM_ABBREVIATIONS = [
	'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
	'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
	'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
] as const;

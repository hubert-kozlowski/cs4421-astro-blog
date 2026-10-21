export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
	event: string;
	[key: string]: unknown;
}

const SERVICE = 'blog-web';

export function log(level: LogLevel, fields: LogFields): void {
	const line = JSON.stringify({
		timestamp: new Date().toISOString(),
		level,
		service: SERVICE,
		...fields,
	});
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

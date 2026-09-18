// Lightweight markdown/MDX -> plaintext conversion, sufficient for keyword search matching.
export function stripMarkdown(raw: string): string {
	return raw
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/[*_>#-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export interface SearchableEntry {
	title: string;
	description: string;
	body: string;
}

export function buildSearchText(entry: SearchableEntry): string {
	return `${entry.title} ${entry.description} ${stripMarkdown(entry.body)}`.toLowerCase();
}

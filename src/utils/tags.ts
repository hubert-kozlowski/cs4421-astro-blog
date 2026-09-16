// Derives a URL-safe, lowercase kebab-case slug from a display tag string.
export function slugifyTag(tag: string): string {
	return tag
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

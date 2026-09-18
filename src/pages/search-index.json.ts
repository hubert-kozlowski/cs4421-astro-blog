import { getCollection } from 'astro:content';
import { buildSearchText } from '../utils/search';

// Build-time search index; a future dynamic search can swap the client fetch target for this route.
export async function GET() {
	const posts = await getCollection('blog');
	const index = posts.map((post) => ({
		slug: post.id,
		searchText: buildSearchText({
			title: post.data.title,
			description: post.data.description,
			body: post.body ?? '',
		}),
	}));

	return new Response(JSON.stringify(index), {
		headers: { 'Content-Type': 'application/json' },
	});
}

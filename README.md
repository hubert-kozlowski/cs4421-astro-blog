# CS4421 Astro Blog

A blog built with [Astro](https://astro.build) content collections, featuring tag filtering and client-side keyword search.

## Features

- Tag filtering and keyword search on `/blog`, both client-side against a build-time index (no full page reload)
- SEO-friendly with canonical URLs and Open Graph data
- Sitemap support
- RSS feed at `/rss.xml`
- Markdown & MDX support

## Project Structure

```text
├── public/
├── src/
│   ├── assets/            # fonts and other static assets bundled at build time
│   ├── components/        # Header, Footer, TagList, SearchBox, etc.
│   ├── content/
│   │   ├── authors/       # author profile entries
│   │   └── blog/          # blog posts (Markdown/MDX)
│   ├── layouts/           # BlogPost.astro
│   ├── pages/
│   │   ├── blog/          # blog index + [...slug] post pages
│   │   ├── tags/          # per-tag listing pages
│   │   ├── search-index.json.ts  # build-time search index endpoint
│   │   └── rss.xml.js
│   └── utils/             # tags.ts, search.ts helpers
├── astro.config.mjs
├── content.config.ts       # blog/authors collection schemas
└── package.json
```

Posts live in `src/content/blog/` as Markdown or MDX files and are typed via the schema in [content.config.ts](content.config.ts).

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run check`           | Type-check the project with `astro check`        |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |

## Adding a Post

Add a new `.md` or `.mdx` file under `src/content/blog/` with frontmatter matching the `blog` collection schema (`title`, `description`, `pubDate`, optional `tags`, `heroImage`, `author`). It will automatically appear in the blog index, tag pages, RSS feed, and search index on the next build.

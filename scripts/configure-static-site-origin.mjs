import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const [sourceDirectory, publicOrigin] = process.argv.slice(2);

if (!sourceDirectory || !publicOrigin) {
	throw new Error('Usage: node configure-static-site-origin.mjs <source-directory> <https-origin>');
}

const url = new URL(publicOrigin);
if (
	url.protocol !== 'https:' ||
	!url.hostname ||
	url.username ||
	url.password ||
	url.pathname !== '/' ||
	url.search ||
	url.hash
) {
	throw new Error(`Expected an HTTPS origin without a path, query, or fragment: ${publicOrigin}`);
}

const configPath = path.resolve(sourceDirectory, 'astro.config.mjs');
const config = await readFile(configPath, 'utf8');
const siteProperty = /^([ \t]*)site:\s*(['"])[^'"\r\n]*\2,?\s*$/m;

if (!siteProperty.test(config)) {
	throw new Error(`Could not find the existing site property in ${configPath}`);
}

await writeFile(configPath, config.replace(siteProperty, `$1site: ${JSON.stringify(url.origin)},`));

const headerPath = path.resolve(sourceDirectory, 'src/components/Header.astro');
const header = await readFile(headerPath, 'utf8');
const legacyNavigation = `<HeaderLink href="/blog">About</HeaderLink>\n\t\t\t<HeaderLink href="/about">Settings</HeaderLink>`;
const correctedNavigation = `<HeaderLink href="/blog">Blog</HeaderLink>\n\t\t\t<HeaderLink href="/about">About</HeaderLink>`;

if (!header.includes(legacyNavigation)) {
	throw new Error('Could not find the legacy static-site navigation items to update.');
}

await writeFile(headerPath, header.replace(legacyNavigation, correctedNavigation));

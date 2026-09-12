import { getCollection } from 'astro:content';

const staticPaths = [
  '',
  'about/',
  'contact/',
  'changelog/',
  'guestbook/',
  'notes/',
  'privacy/',
  'tools/',
  'tools/travel/',
  'tools/lunch/',
  'tools/leave/',
  'tools/qr/',
  'tools/fingerprint/',
];

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function urlEntry(location: string, lastModified?: Date) {
  const lastmod = lastModified
    ? `<lastmod>${lastModified.toISOString().slice(0, 10)}</lastmod>`
    : '';

  return `  <url><loc>${escapeXml(location)}</loc>${lastmod}</url>`;
}

export async function GET({ site }: { site?: URL }) {
  const origin = site ?? new URL('https://www.nonbisa.com/');
  const notes = await getCollection('notes', ({ data }) => !data.draft);

  const staticUrls = staticPaths.map((path) =>
    urlEntry(new URL(path, origin).toString()),
  );

  const noteUrls = notes
    .sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime())
    .map((note) =>
      urlEntry(
        new URL(`notes/${note.id}/`, origin).toString(),
        note.data.updatedAt ?? note.data.publishedAt,
      ),
    );

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticUrls,
    ...noteUrls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

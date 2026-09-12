export function GET({ site }: { site?: URL }) {
  const origin = site ?? new URL('https://www.nonbisa.com/');
  const sitemap = new URL('sitemap.xml', origin);

  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${sitemap.toString()}\n`,
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  );
}

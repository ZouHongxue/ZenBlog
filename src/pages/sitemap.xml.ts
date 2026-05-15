import { getCollection } from 'astro:content';

export async function GET() {
  const posts = await getCollection('blog');
  const base = 'https://ZouHongxue.github.io/ZenBlog';

  const pages = [
    { url: `${base}/`, lastmod: new Date().toISOString() },
    { url: `${base}/blog/`, lastmod: new Date().toISOString() },
    { url: `${base}/about/`, lastmod: new Date().toISOString() },
    ...posts.map(post => ({
      url: `${base}/blog/${post.slug}/`,
      lastmod: new Date(post.data.pubDate).toISOString(),
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${p.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

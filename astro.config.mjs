import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ZouHongxue.github.io',
  base: '/ZenBlog',
  integrations: [tailwind(), mdx(), sitemap()],
});

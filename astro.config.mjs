import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://ZouHongxue.github.io',
  base: '/ZenBlog',
  integrations: [tailwind(), mdx()],
});

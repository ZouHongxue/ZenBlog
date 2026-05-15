import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://your-username.github.io',
  base: '/zen-blog',
  integrations: [tailwind(), mdx()],
});

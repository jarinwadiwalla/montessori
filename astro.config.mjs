import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://montessoriforadolescents.com',
  output: 'static',
  integrations: [sitemap()],
  redirects: {
    '/about': '/consulting/',
    '/about/': '/consulting/',
  },
  build: {
    assets: '_assets',
  },
});

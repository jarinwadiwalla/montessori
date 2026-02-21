import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://montessoriforadolescents.com',
  output: 'static',
  integrations: [sitemap()],
  redirects: {
    '/about': '/support/',
    '/about/': '/support/',
    '/consulting': '/support/',
    '/consulting/': '/support/',
    '/partners': '/our-team/',
    '/partners/': '/our-team/',
  },
  build: {
    assets: '_assets',
  },
});

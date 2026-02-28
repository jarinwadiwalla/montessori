import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://montessoriforadolescents.com',
  output: 'static',
  integrations: [sitemap()],
  redirects: {
    '/about/': '/support/',
    '/consulting/': '/support/',
    '/partners/': '/our-team/',
    '/whole-person/': '/whole-human/',
  },
  build: {
    assets: '_assets',
  },
});

import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://montessoriforadolescents.com',
  output: 'static',
  integrations: [
    sitemap({
      // Keep purchase-confirmation and paid-recording pages out of search results
      filter: (page) =>
        !page.includes('/webinars/thank-you') && !page.endsWith('/watch/'),
    }),
  ],
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

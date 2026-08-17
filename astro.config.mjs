import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://montessoriforadolescents.com',
  output: 'static',
  integrations: [
    sitemap({
      // Keep purchase-confirmation, paid-recording, and members-only pages
      // out of search results. The Collective's landing and guidelines pages
      // stay in — those are public and worth ranking.
      filter: (page) =>
        !page.includes('/webinars/thank-you') &&
        !page.endsWith('/watch/') &&
        !page.includes('/collective/login') &&
        !page.includes('/collective/verify') &&
        !page.includes('/collective/portal') &&
        !page.includes('/collective/welcome'),
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

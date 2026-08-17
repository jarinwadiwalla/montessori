import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://montessoriforadolescents.com',
  output: 'static',
  integrations: [
    sitemap({
      // Keep purchase-confirmation, paid-recording, and members-only pages
      // out of search results.
      //
      // Everything under /collective/ is members-only EXCEPT the landing and
      // guidelines pages, which are public and worth ranking. Written as an
      // allow-list so a new page added in there is private by default.
      filter: (page) => {
        if (page.includes('/webinars/thank-you')) return false;
        if (page.endsWith('/watch/')) return false;

        const collective = page.match(/\/collective\/(.*)$/);
        if (collective) {
          const rest = collective[1];
          return rest === '' || rest === 'guidelines/';
        }
        return true;
      },
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

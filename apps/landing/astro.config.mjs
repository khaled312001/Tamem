import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://deliverytamem.com',
  integrations: [
    tailwind(),
    sitemap({
      // lastmod is the one hint Google still uses for recrawl scheduling;
      // priority/changefreq are ignored, so they're deliberately not set.
      lastmod: new Date(),
      filter: (page) => !page.includes('/super_admin') && !page.includes('/backendtamem'),
    }),
  ],
  i18n: {
    defaultLocale: 'ar',
    locales: ['ar'],
  },
});

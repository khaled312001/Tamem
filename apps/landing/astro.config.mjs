import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://deliverytamem.com',
  integrations: [tailwind(), sitemap()],
  i18n: {
    defaultLocale: 'ar',
    locales: ['ar'],
  },
});

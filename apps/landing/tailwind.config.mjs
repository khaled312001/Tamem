import { tailwindPreset } from '@tamem/ui';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  presets: [tailwindPreset],
};

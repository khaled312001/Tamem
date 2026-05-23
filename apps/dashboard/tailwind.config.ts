import { tailwindPreset } from '@tamem/ui';
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  presets: [tailwindPreset as Partial<Config>],
  plugins: [animate],
};

export default config;

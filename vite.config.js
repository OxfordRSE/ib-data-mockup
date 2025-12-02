import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';

export default defineConfig({
  base: './', // << important for GitHub Pages / custom domain
  plugins: [react(), tailwindcss()],
});
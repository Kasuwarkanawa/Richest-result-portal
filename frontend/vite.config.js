import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages serves this project from a repository subpath; Vercel serves it at the domain root.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/Richest-result-portal/' : '/',
  plugins: [react(), tailwindcss()],
});

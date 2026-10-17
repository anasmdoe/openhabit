import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  '^/api(/v1)?/habits': { target: 'http://localhost:3001', rewrite: (p: string) => p.replace(/^\/api(\/v1)?/, '') },
  '^/api(/v1)?/entries': { target: 'http://localhost:3002', rewrite: (p: string) => p.replace(/^\/api(\/v1)?/, '') },
  '^/api(/v1)?/wellness': { target: 'http://localhost:3002', rewrite: (p: string) => p.replace(/^\/api(\/v1)?/, '') },
  '^/api(/v1)?/analytics': { target: 'http://localhost:3003', rewrite: (p: string) => p.replace(/^\/api(\/v1)?/, '') },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});

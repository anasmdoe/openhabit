import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  '/api/habits': { target: 'http://localhost:3001', rewrite: (p: string) => p.replace(/^\/api/, '') },
  '/api/entries': { target: 'http://localhost:3002', rewrite: (p: string) => p.replace(/^\/api/, '') },
  '/api/wellness': { target: 'http://localhost:3002', rewrite: (p: string) => p.replace(/^\/api/, '') },
  '/api/analytics': { target: 'http://localhost:3003', rewrite: (p: string) => p.replace(/^\/api/, '') },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});

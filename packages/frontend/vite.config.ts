import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Matches the backend's own PORT default (packages/backend/src/config.ts).
const backendPort = process.env.BACKEND_PORT || '3001';
const backendUrl = `http://localhost:${backendPort}`;
const serverPort = parseInt(process.env.VITE_PORT || '5173', 10);
const serverHost = process.env.VITE_HOST || 'localhost';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React dependencies
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI primitives
          'vendor-ui': ['@base-ui-components/react'],
          // Data fetching and state management
          'vendor-data': ['@tanstack/react-query', 'zustand', 'socket.io-client'],
          // Markdown rendering
          'vendor-markdown': ['react-markdown'],
          // Math rendering (KaTeX)
          'vendor-katex': ['katex', 'remark-math', 'rehype-katex'],
        },
      },
    },
  },
  server: {
    port: serverPort,
    strictPort: true,
    host: serverHost,
    proxy: {
      '/health': { target: backendUrl, changeOrigin: true },
      '/generated': { target: backendUrl, changeOrigin: true },
      '/uploads': { target: backendUrl, changeOrigin: true },
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      // Only proxy backend auth routes, not /auth/callback (frontend route)
      '/auth/github': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/auth/google': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/auth/claude': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/auth/me': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/auth/logout': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/auth/providers': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});

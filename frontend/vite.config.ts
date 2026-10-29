import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateDeploymentOrigins } from './src/lib/websocket/deploymentOrigins';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  validateDeploymentOrigins(env);
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          ws: true,
        },
        '/ws': {
          target: 'ws://127.0.0.1:3000',
          ws: true,
        },
      },
    },
    preview: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          ws: true,
        },
        '/ws': {
          target: 'ws://127.0.0.1:3000',
          ws: true,
        },
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query',
        'gsap',
        'zustand',
        'zod',
        'qrcode.react',
      ],
    },
  };
});

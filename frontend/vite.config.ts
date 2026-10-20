import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateDeploymentOrigins } from './src/lib/websocket/deploymentOrigins';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  validateDeploymentOrigins(env);
  return { plugins: [react()] };
});

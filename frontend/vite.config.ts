import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), '');
  const isDev = mode === 'development';

  return {
    plugins: [react()],
    envDir: path.resolve(__dirname),
    server: {
      port: 3000,
      host: true
    },
    define: {
      'import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS': JSON.stringify(
        isDev ? (env.VITE_ENABLE_DEMO_ACCOUNTS || 'true') : 'false'
      ),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'http://localhost:5000/api'),
    }
  };
});

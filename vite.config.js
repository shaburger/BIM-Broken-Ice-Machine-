import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function ignoreAbortedProxyErrors(proxy) {
  proxy.on('error', (err) => {
    if (err?.code === 'ECONNABORTED' || err?.code === 'ECONNRESET') return;
    console.warn('[vite proxy]', err?.message || err);
  });
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        configure: ignoreAbortedProxyErrors,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
        configure: ignoreAbortedProxyErrors,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});

import { defineConfig } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  // NOTE 1: @vitejs/plugin-react is intentionally not used. Babel on this
  // machine needs minutes per file, which makes the dev server unusable.
  // Vite's built-in esbuild transform handles .tsx via tsconfig.json
  // ("jsx": "react-jsx"). Re-add the plugin once the disk is healthy.
  esbuild: {
    jsx: 'automatic',
  },

  // NOTE 2: The project lives on a very slow volume, so the default
  // `node_modules/.vite` cache dir made dep-optimisation crawl for minutes.
  cacheDir: join(tmpdir(), 'sonic-sentinel-vite-cache'),

  // NOTE 3: Skip the automatic "discover every bare import" crawl and
  // pre-bundle the known deps explicitly instead.
  optimizeDeps: {
    noDiscovery: true,
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'framer-motion',
      'lucide-react',
      'recharts',
      'axios',
    ],
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.ML_SERVICE_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});

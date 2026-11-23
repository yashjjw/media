import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' keeps asset paths relative, so the build works on Vercel and in any static host.
export default defineConfig({
  plugins: [react()],
  base: './',
  // Recharts is the bulk of the bundle (~185 kB gzipped in total), which is fine for a prototype.
  build: { chunkSizeWarningLimit: 700 },
  test: { environment: 'node' },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
const entry = (name: string) => fileURLToPath(new URL(`./src/entries/${name}.tsx`, import.meta.url));

export default defineConfig({
  root,
  base: '/app/',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../public/app', import.meta.url)),
    emptyOutDir: true,
    manifest: true,
    target: ['chrome117', 'edge121', 'firefox121', 'safari17'],
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      input: {
        home: entry('home'),
        setup: entry('setup'),
        login: entry('login'),
        dashboard: entry('dashboard'),
        admin: entry('admin'),
        account: entry('account'),
        design: entry('design'),
        view: entry('view'),
        album: entry('album'),
        profile: entry('profile'),
        report: entry('report'),
        notfound: entry('notfound'),
        legal: entry('legal'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: (info: { name?: string; names?: string[] }) =>
          (info.names?.[0] ?? info.name ?? '').endsWith('.css') ? 'assets/styles-[hash][extname]' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5173',
  },
});

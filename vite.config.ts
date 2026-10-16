import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the build also works from a sub-folder such as GitHub Pages.
  base: './',
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    outDir: 'dist',
    // The 3D test page ships alongside the game.
    rollupOptions: { input: { main: 'index.html', proto3d: 'proto3d.html' } },
  },
});

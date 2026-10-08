import { defineConfig } from 'vite';

// base relativa: funciona tanto local quanto em https://<user>.github.io/devlife-simulator/
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 }, // Phaser sozinho já passa de 1 MB
});

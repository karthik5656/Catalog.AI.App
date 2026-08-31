import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  server: {
    port: 3001,
  },
  preview: {
    port: 3001,
  },
  plugins: [
    react(),
    federation({
      name: 'merchantApp',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App',
      },
      shared: ['react', 'react-dom', 'react-router-dom'],
    }),
    {
      name: 'vite-plugin-notify-host-on-rebuild',
      apply(config, { command }) {
        return Boolean(command === 'build' && config.build?.watch);
      },
      async buildEnd(error) {
        if (!error) {
          try {
            await fetch('http://localhost:3000/__fullReload');
          } catch (e) {
            console.log(e);
          }
        }
      },
    } satisfies Plugin,
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});

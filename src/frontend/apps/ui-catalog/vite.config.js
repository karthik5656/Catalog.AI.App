import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';
import react from '@vitejs/plugin-react';

// Read remote apps config — single source of truth
const remotesConfigPath = path.resolve(import.meta.dirname, 'remotes.json');
const remotesConfig = JSON.parse(fs.readFileSync(remotesConfigPath, 'utf-8'));

// Build federation remotes map from JSON: { scope: url }
const federationRemotes = {};
for (const remote of remotesConfig) {
  federationRemotes[remote.scope] = remote.url;
}

/**
 * Vite plugin that generates src/remoteApps.generated.jsx from remotes.json.
 * The generated file contains static import() calls that the federation plugin
 * can transform in both dev and build modes.
 *
 * In dev mode, it also watches remotes.json for changes and regenerates.
 */
function remoteAppsPlugin() {
  const outputPath = path.resolve(import.meta.dirname, 'src', 'remoteApps.generated.jsx');

  function generate() {
    const config = JSON.parse(fs.readFileSync(remotesConfigPath, 'utf-8'));

    const entries = config.map((app) => {
      const modulePath = app.module.replace('./', '');
      return `  {
    route: "${app.route}",
    label: "${app.label}",
    Component: React.lazy(() => import("${app.scope}/${modulePath}"))
  }`;
    });

    const code = `/* AUTO-GENERATED from remotes.json — do not edit manually */
import React from 'react';

export const remoteApps = [
${entries.join(',\n')}
];
`;

    fs.writeFileSync(outputPath, code, 'utf-8');
  }

  return {
    name: 'vite-plugin-remote-apps',
    enforce: 'pre',

    buildStart() {
      generate();
    },

    configureServer(server) {
      // Watch remotes.json and regenerate + HMR on change
      server.watcher.add(remotesConfigPath);
      server.watcher.on('change', (changedPath) => {
        if (path.normalize(changedPath) === path.normalize(remotesConfigPath)) {
          generate();
          server.hot.send({ type: 'full-reload' });
        }
      });
    },
  };
}

export default defineConfig({
  base: '/ui-catalog/',
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  plugins: [
    react(),
    remoteAppsPlugin(),
    federation({
      name: 'app',
      remotes: federationRemotes,
      shared: ['react', 'react-dom', 'react-router-dom'],
    }),
    {
      name: 'vite-plugin-reload-endpoint',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/__fullReload') {
            server.hot.send({ type: 'full-reload' });
            res.end('Full reload triggered');
          } else {
            next();
          }
        });
      },
    },
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Mediatore Barlettano',
        // Sotto l'icona della schermata Home ci stanno poche lettere: il nome
        // intero verrebbe troncato a meta', quindi li' resta quello corto.
        short_name: 'Mediatore',
        description: 'Gioco di carte a prese con trionfo, in modalita hotseat',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        background_color: '#123524',
        theme_color: '#123524',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // App shell e mazzo in cache: in hotseat si gioca tutto in locale,
        // anche offline, e le carte non devono comparire a pezzi.
        globPatterns: ['**/*.{js,css,html,svg,webp}'],
      },
    }),
  ],
  // L'engine e' un package del workspace in TypeScript sorgente: niente pre-bundling.
  optimizeDeps: { exclude: ['@mediatore/engine'] },
});

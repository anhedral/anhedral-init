import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: () => {
    const crxPublicKey = process.env.VITE_CRX_PUBLIC_KEY || '';

    return {
      name: 'demo',
      description: 'demo Chrome Extension',
      version: '0.1.0',
      ...(crxPublicKey ? { key: crxPublicKey } : {}),
      minimum_chrome_version: '114',
      permissions: ['activeTab', 'cookies', 'storage', 'sidePanel'],
      host_permissions: [],
      action: {
        default_title: 'Open demo',
      },
      side_panel: {
        default_path: 'sidepanel.html',
      },
    };
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    build: {
      chunkSizeWarningLimit: 3000,
    },
  }),
});

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? './',
  plugins: [vue()],
  define: {
    __APP_CACHE_VERSION__: JSON.stringify(String(Date.now()))
  },
  server: {
    host: '127.0.0.1'
  },
  preview: {
    host: '127.0.0.1'
  }
});

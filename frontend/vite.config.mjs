import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    outDir: fileURLToPath(new URL('../static/vue', import.meta.url)),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./main.js', import.meta.url)),
      name: 'TamagoVue',
      formats: ['iife'],
      fileName: () => 'app.js',
    },
  },
});

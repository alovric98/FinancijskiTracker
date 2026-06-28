import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

// Build cilja src/main.jsx direktno (NE index.html) da build ne dira index.html.
// Output je jedan samostalan bundle `index.js` u rootu — njega WordPress učitava
// preko raw.githack CDN-a. CSS je inliniran u JS (vite-plugin-css-injected-by-js).
export default defineConfig({
  plugins: [react(), cssInjectedByJsPlugin()],
  build: {
    outDir: '.',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunk-[name].js',
        assetFileNames: '[name].[ext]',
      }
    }
  }
})

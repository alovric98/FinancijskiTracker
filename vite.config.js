import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

/*
 * PostCSS plugin: forsira !important na SVE naše CSS deklaracije (osim @keyframes).
 * Razlog: app se renderira unutar klijentovog WordPressa (Elementor + Wealth Builder
 * tema) koja agresivno gazi stilove vlastitim !important pravilima (resetira button,
 * input, div pozadine itd.). Naša kartica .cbt je <button> pa je tema bojala bijelo.
 * Originalna radna verzija je rješavala isto s ~296 !important-a. Ovdje to radimo
 * automatski pri buildu da ne zatrpavamo izvor.
 */
const forceImportant = {
  postcssPlugin: 'ft-force-important',
  OnceExit(root) {
    root.walkRules((rule) => {
      const parent = rule.parent
      if (parent && parent.type === 'atrule' && /keyframes/i.test(parent.name)) return
      rule.walkDecls((decl) => { decl.important = true })
    })
  },
}

export default defineConfig({
  plugins: [react(), cssInjectedByJsPlugin()],
  css: {
    postcss: {
      plugins: [forceImportant],
    },
  },
  build: {
    outDir: '.',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunk-[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})

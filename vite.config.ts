// @ts-nocheck

import { defineConfig } from 'vite'
import { build as buildWithEsbuild } from 'esbuild'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'

export default defineConfig({
  plugins: [
    {
      name: 'extension-files',
      apply: 'build',
      async closeBundle() {
        mkdirSync('dist', { recursive: true })
        mkdirSync('dist/icons', { recursive: true })
        copyFileSync('public/manifest.json', 'dist/manifest.json')
        copyFileSync('public/frame-rules.json', 'dist/frame-rules.json')
        copyFileSync('public/chat.html', 'dist/chat.html')
        copyFileSync('src/chat/chat.css', 'dist/chat.css')
        copyFileSync('src/icons/chatgpt.png', 'dist/icons/chatgpt.png')
        copyFileSync('src/icons/gemini.png', 'dist/icons/gemini.png')

        await buildWithEsbuild({
          entryPoints: [resolve(__dirname, 'src/content/index.ts')],
          outfile: resolve(__dirname, 'dist/content.js'),
          bundle: true,
          format: 'iife',
          platform: 'browser',
          target: 'chrome114',
          minify: false,
        })
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        chat: resolve(__dirname, 'src/chat/index.ts'),
      },
      output: {
        entryFileNames: '[name].js'
      }
    }
  }
})

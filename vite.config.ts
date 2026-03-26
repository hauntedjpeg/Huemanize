import { defineConfig, type Plugin } from 'vite'
import { renameSync } from 'fs'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Moves the built index.html → ui.html at the repo root after each build.
function renameToUiHtml(): Plugin {
  return {
    name: 'rename-to-ui-html',
    closeBundle() {
      const root = resolve(process.cwd())
      renameSync(resolve(root, 'dist/index.html'), resolve(root, 'ui.html'))
    },
  }
}

export default defineConfig({
  root: 'src/ui',
  plugins: [react(), tailwindcss(), viteSingleFile(), renameToUiHtml()],
  build: {
    outDir: resolve(process.cwd(), 'dist'),
    emptyOutDir: true,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Electronで読み込むための相対パス
  build: {
    outDir: 'dist',
  },
})

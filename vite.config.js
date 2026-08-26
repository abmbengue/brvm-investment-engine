import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // '/' for Vercel/local ; set VITE_BASE=/brvm-investment-engine/ for GitHub Pages
  base: process.env.VITE_BASE || '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    chunkSizeWarningLimit: 1500,

    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],

          router: ['react-router-dom'],

          ui: [
            '@headlessui/react',
            '@heroicons/react',
            'framer-motion'
          ],

          charts: ['recharts'],

          utils: [
            'date-fns',
            'clsx',
            'tailwind-merge'
          ],

          pdf: [
            'jspdf',
            'jspdf-autotable'
          ],

          excel: ['xlsx'],

          toast: ['react-toastify'],

          query: [
            '@tanstack/react-query',
            '@tanstack/react-query-devtools'
          ]
        }
      }
    }
  },

  server: {
    hmr: true,

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        ws: true
      },

      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
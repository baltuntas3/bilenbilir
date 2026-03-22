import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mantine': [
            '@mantine/core',
            '@mantine/hooks',
            '@mantine/form',
            '@mantine/notifications',
          ],
          'vendor-icons': ['@tabler/icons-react'],
          'vendor-query': ['@tanstack/react-query', 'axios'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
  },
})

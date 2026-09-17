import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SK11 Finance',
    short_name: 'SK11',
    description: 'SK11 finance management system',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B1736',
    theme_color: '#0B1736',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}
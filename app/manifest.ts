import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reader',
    short_name: 'Reader',
    description: 'Save, read, mark, speed-read and listen.',
    start_url: '/',
    display: 'standalone',
    background_color: '#262624',
    theme_color: '#262624',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}

import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reader',
  description: 'Save, read, mark, speed-read and listen.',
  appleWebApp: { capable: true, title: 'Reader', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#262624',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="charcoal">
      <body>{children}</body>
    </html>
  );
}

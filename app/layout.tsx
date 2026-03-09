import { ReactNode } from 'react';
import SessionProvider from './SessionProvider';

export const metadata = {
  title: 'Spark Benjamin — Dashboard',
  description: 'License and QuickBooks dashboard',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  themeColor: '#7c6fff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <meta name="theme-color" content="#7c6fff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body style={{ margin: 0 }}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

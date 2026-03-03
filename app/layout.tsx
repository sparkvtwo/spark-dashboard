import { ReactNode } from 'react';
import SessionProvider from './SessionProvider';

export const metadata = { title: 'Spark Benjamin — Dashboard' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0 }}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

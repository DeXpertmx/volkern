import React from 'react';
import '@/app/globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { SessionProvider } from '@/components/session-provider';
import { PushNotificationInit } from '@/components/providers/PushNotificationInit';

const inter = Inter({ subsets: ['latin'] });

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Volkern | La Infraestructura Soberana para tu Empresa',
  description: 'Unifica Marketing, Ventas y Operaciones con IA propia y datos protegidos.',
  icons: {
    icon: '/volkern-icon.png',
    shortcut: '/volkern-icon.png',
    apple: '/volkern-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0f1d46',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} selection:bg-blue-500/30`}>
        <SessionProvider>
          <PushNotificationInit />
          {children}
          <Toaster position="top-center" theme="dark" />
        </SessionProvider>
      </body>
    </html>
  );
}

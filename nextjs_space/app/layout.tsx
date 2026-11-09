import React from 'react';
import '@/app/globals.css';
import { Inter } from 'next/font/google';

export const dynamic = 'force-dynamic';
import { Toaster } from '@/components/ui/sonner';
import { SessionProvider } from '@/components/session-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { PushNotificationInit } from '@/components/providers/PushNotificationInit';
import { IncomingMessageWatcher } from '@/components/messaging/IncomingMessageWatcher';
import { PWAInstallPrompt } from '@/components/providers/PWAInstallPrompt';
import { CookieConsentBanner } from '@/components/public/CookieConsentBanner';

const inter = Inter({ subsets: ['latin'] });


export const metadata = {
  title: 'Volkern | La Infraestructura Soberana para tu Empresa',
  description: 'Unifica Marketing, Ventas y Operaciones con IA propia y datos protegidos.',
  // Va en los metadatos y no como <link> suelto para que una sección pueda
  // sustituirlo con el suyo (el módulo inmobiliario lo hace): se resuelve en el
  // servidor y el navegador lo ve al instalar, sin depender del JavaScript.
  manifest: '/manifest.json',
  icons: {
    icon: '/volkern-icon.png',
    shortcut: '/volkern-icon.png',
    apple: '/volkern-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Las barras de app (módulo inmobiliario) llegan hasta el borde inferior: sin
  // esto, iOS las tapa con la barra de gestos.
  viewportFit: 'cover' as const,
  themeColor: '#0f1d46',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Volkern',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Volkern" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Volkern" />
        <meta name="format-detection" content="telephone=no" />
        <script src="/webmcp.js" defer />
      </head>
      <body className={`${inter.className} selection:bg-blue-500/30`}>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
            <PushNotificationInit />
            <IncomingMessageWatcher />
            <PWAInstallPrompt />
            {children}
            <CookieConsentBanner />
            <Toaster position="top-center" />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

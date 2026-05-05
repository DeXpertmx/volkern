import React from 'react';
import '@/app/globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { SessionProvider } from '@/components/session-provider';

const inter = Inter({ subsets: ['latin'] });

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Volkern | La Infraestructura Soberana para tu Empresa',
  description: 'Unifica Marketing, Ventas y Operaciones con IA propia y datos protegidos.',
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
          {children}
          <Toaster position="top-center" theme="dark" />
        </SessionProvider>
      </body>
    </html>
  );
}

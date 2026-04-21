
export const dynamic = "force-dynamic";

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import './webcreator-blocks.css'
import { SessionProvider } from '@/components/session-provider'
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import Script from 'next/script'
import { OneSignalInit } from '@/components/providers/OneSignalInit'
import { Toaster as SonnerToaster } from 'sonner'
import { authenticateRequest } from '@/lib/api-key-auth'
import { runWithTenant } from '@/lib/db'
import ImpersonationBanner from '@/components/admin/ImpersonationBanner'
import { headers } from 'next/headers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'Volkern CRM - Gestión de Leads y Citas',
  description: 'CRM y plataforma de automatización para emprendedores digitales, coaches y agencias',
  openGraph: {
    title: 'Volkern CRM - Gestión de Leads y Citas',
    description: 'CRM y plataforma de automatización para emprendedores digitales, coaches y agencias',
    images: ['/volkern-logo.png'],
  },
  icons: {
    icon: '/volkern-icon.png',
    shortcut: '/volkern-icon.png',
    apple: '/volkern-icon.png',
  },
  verification: {
    google: 'z1uYYpqBXAZ_RvztYtBIxUdy_NqDbHJBJy9-O0IC9kA',
  },
}

import { BrandingProvider } from '@/components/providers/BrandingProvider'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Resolver el contexto del tenant basándose en la sesión/cookies
  // Usamos una request "dummy" para authenticateRequest
  const headersList = headers();
  const dummyRequest = new Request('https://localhost', { headers: headersList });
  const auth = await authenticateRequest(dummyRequest);
  const tenantId = auth.tenant?.id || 'default';

  return (
    <html lang="es-MX">
      <body className={inter.className}>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {/* runWithTenant asegura que cualquier llamada a 'prisma' dentro de los hijos
                use automáticamente la base de datos del tenant correcto */}
            {await runWithTenant(tenantId, async () => (
              <BrandingProvider>
                <OneSignalInit />
                <ImpersonationBanner />
                {children}
                <Toaster />
                <SonnerToaster position="top-right" richColors />
                <Script
                  src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
                  strategy="afterInteractive"
                  defer
                />
              </BrandingProvider>
            ))}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}

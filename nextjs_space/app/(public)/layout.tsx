import React from 'react';
import '@/app/globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Volkern | La Infraestructura Soberana para tu Empresa',
  description: 'Unifica Marketing, Ventas y Operaciones con IA propia y datos protegidos.',
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} bg-slate-950 text-white selection:bg-blue-500/30`}>
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">V</div>
            <span className="text-xl font-bold tracking-tighter">VOLKERN</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">Precios</a>
            <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Ecosistema</a>
            <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Soberanía</a>
            <a href="/auth/login" className="text-sm font-medium bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 hover:bg-slate-800 transition-all">
              Login
            </a>
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="bg-slate-950 border-t border-slate-900 py-12">
        <div className="container mx-auto px-6 text-center">
          <p className="text-slate-500 text-sm mb-4">
            &copy; {new Date().getFullYear()} Volkern Nexus Core. Todos los derechos reservados.
          </p>
          <div className="flex justify-center gap-6 text-xs text-slate-600">
            <a href="/privacy" className="hover:text-slate-400">Privacidad</a>
            <a href="/terms" className="hover:text-slate-400">Términos</a>
            <a href="#" className="hover:text-slate-400">Status</a>
          </div>
        </div>
      </footer>
      <Toaster position="top-center" theme="dark" />
    </div>
  );
}

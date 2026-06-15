import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { NewLanding } from '@/components/public/NewLanding';
import { verticalLinks } from '@/components/public/PublicLayout';

export const metadata = {
  title: 'Volkern | El sistema operativo de tu negocio',
  description:
    'Volkern reúne CRM, marketing, comunicación, automatización e IA en una sola plataforma para operar tu negocio con menos herramientas y más control.',
};

export default function LandingPage() {
  return (
    <>
      <NewLanding />

      {/* Footer — same as PublicLayout */}
      <footer className="bg-[#060b16] border-t border-slate-800 py-12">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <Image
                src="/volkern-logo.png"
                alt="Volkern CRM"
                width={100}
                height={28}
                className="h-6 w-auto brightness-0 invert mb-4"
              />
              <p className="text-sm text-slate-500 max-w-md leading-relaxed">
                El Sistema Operativo Empresarial que unifica Marketing, Ventas,
                Operaciones y Finanzas con IA propia y soberanía de datos.
              </p>
            </div>

            {/* Soluciones */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                Soluciones
              </h4>
              <ul className="space-y-2">
                {verticalLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Enlaces */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                Enlaces
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/precios" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Precios
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Crear cuenta
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Iniciar Sesión
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              &copy; {new Date().getFullYear()} Volkern Nexus Core. Todos los derechos reservados.
            </p>
            <div className="flex justify-center gap-6 text-xs text-slate-600">
              <Link href="/privacy" className="hover:text-slate-400 transition-colors">
                Política de Privacidad
              </Link>
              <Link href="/terms" className="hover:text-slate-400 transition-colors">
                Términos de Servicio
              </Link>
              <Link
                href="/verifactu"
                className="hover:text-amber-400 transition-colors font-medium text-amber-500"
              >
                Veri*Factu
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

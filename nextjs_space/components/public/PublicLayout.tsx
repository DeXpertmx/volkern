'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, Building2, Calculator, PenTool, GraduationCap, Factory, UserCheck, Zap } from 'lucide-react';

const verticalLinks = [
  { name: 'Inmobiliarias', href: '/soluciones/real-estate', icon: Building2 },
  { name: 'Asesorías Contables', href: '/soluciones/accounting', icon: Calculator },
  { name: 'Agencias Marketing', href: '/soluciones/marketing', icon: PenTool },
  { name: 'Academias (LMS)', href: '/soluciones/academy', icon: GraduationCap },
  { name: 'Industria', href: '/soluciones/industria', icon: Factory },
  { name: 'Recursos Humanos', href: '/soluciones/rrhh', icon: UserCheck },
  { name: 'CRM Ventas', href: '/soluciones/crm-ventas', icon: Zap },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solucionesOpen, setSolucionesOpen] = useState(false);

  return (
    <div className="bg-slate-950 text-white min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image 
              src="/volkern-logo.png" 
              alt="Volkern CRM" 
              width={120} 
              height={32} 
              className="h-8 w-auto brightness-0 invert"
            />
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {/* Soluciones Dropdown */}
            <div className="relative group">
              <button
                onClick={() => setSolucionesOpen(!solucionesOpen)}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Soluciones
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
              </button>
              
              {/* Dropdown Menu */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 min-w-[240px] shadow-2xl">
                  {verticalLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 transition-colors group/item"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center group-hover/item:bg-slate-700 transition-colors">
                          <Icon className="w-4 h-4 text-slate-400 group-hover/item:text-blue-400 transition-colors" />
                        </div>
                        <span className="text-sm text-slate-300 group-hover/item:text-white transition-colors font-medium">
                          {link.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            <a href="/precios" className="text-sm text-slate-400 hover:text-white transition-colors">Precios</a>
            <a href="/#real-estate" className="text-sm text-slate-400 hover:text-white transition-colors">Ecosistema</a>
            <a href="/#demo" className="text-sm text-slate-400 hover:text-white transition-colors">Demo</a>
            <a href="/auth/login" className="text-sm font-medium bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 hover:bg-slate-800 transition-all">
              Login
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Abrir menú"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </nav>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-slate-900 bg-slate-950 overflow-hidden"
            >
              <div className="container mx-auto px-6 py-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">Soluciones</p>
                {verticalLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-900 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-300">{link.name}</span>
                    </Link>
                  );
                })}
                <div className="border-t border-slate-900 pt-2 mt-2 space-y-2">
                  <a href="/precios" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm text-slate-400 hover:text-white transition-colors">Precios</a>
                  <a href="/#demo" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm text-slate-400 hover:text-white transition-colors">Demo</a>
                  <a href="/auth/login" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">Login</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-slate-950 border-t border-slate-900 py-12 mt-auto">
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
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Soluciones</h4>
              <ul className="space-y-2">
                {verticalLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-400 hover:text-white transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Enlaces */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Enlaces</h4>
              <ul className="space-y-2">
                <li><a href="/precios" className="text-sm text-slate-400 hover:text-white transition-colors">Precios</a></li>
                <li><a href="/#demo" className="text-sm text-slate-400 hover:text-white transition-colors">Solicitar Demo</a></li>
                <li><a href="/auth/login" className="text-sm text-slate-400 hover:text-white transition-colors">Iniciar Sesión</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-900 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              &copy; {new Date().getFullYear()} Volkern Nexus Core. Todos los derechos reservados.
            </p>
            <div className="flex justify-center gap-6 text-xs text-slate-600">
              <a href="/privacy" className="hover:text-slate-400 transition-colors">Política de Privacidad</a>
              <a href="/terms" className="hover:text-slate-400 transition-colors">Términos de Servicio</a>
              <a href="/verifactu" className="hover:text-amber-400 transition-colors font-medium text-amber-500">Veri*Factu</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

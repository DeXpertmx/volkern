import Image from 'next/image';
import Link from 'next/link';

export function PublicLayout({ children }: { children: React.ReactNode }) {
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

      <main className="flex-1">{children}</main>

      <footer className="bg-slate-950 border-t border-slate-900 py-12 mt-auto">
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
    </div>
  );
}

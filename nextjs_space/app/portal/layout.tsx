
'use client';

import { ReactNode } from 'react';
import Image from 'next/image';
import { useWhitelabel } from '@/hooks/use-whitelabel';
import { cn } from '@/lib/utils';

interface PortalLayoutProps {
    children: ReactNode;
}

export default function PortalLayout({ children }: PortalLayoutProps) {
    const { config, loading } = useWhitelabel();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Branded Header */}
            <header className="bg-white border-b sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <div className="relative w-32 h-8">
                                <Image
                                    src={config.logoUrl || '/volkern-logo.png'}
                                    alt={config.nombreEmpresa}
                                    fill
                                    className="object-contain object-left"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-muted-foreground hidden sm:inline-block">
                                Portal del Cliente - {config.nombreEmpresa}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>

            {/* Branded Footer */}
            <footer className="bg-white border-t py-8 mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                        &copy; {new Date().getFullYear()} {config.nombreEmpresa}. Todos los derechos reservados.
                    </div>
                    <div className="flex gap-6 text-sm text-muted-foreground">
                        <a href="#" className="hover:text-primary transition-colors">Soporte</a>
                        <a href="#" className="hover:text-primary transition-colors">Términos y Condiciones</a>
                        <a href="#" className="hover:text-primary transition-colors">Privacidad</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

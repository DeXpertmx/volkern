import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import LandingClient from '@/components/public/LandingClient';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern | El sistema operativo de tu negocio',
  description:
    'Volkern reúne CRM, marketing, comunicación, automatización e IA en una sola plataforma para operar tu negocio con menos herramientas y más control.',
  openGraph: {
    title: 'Volkern — El sistema operativo de tu negocio',
    description:
      'Volkern reúne CRM, marketing, comunicación, automatización e IA en una sola plataforma. 8 verticales, un sistema.',
    images: ['/og-home.png'],
  },
};

export default async function LandingPage() {
  const headerStore = await headers();
  const subdomain = headerStore.get('x-tenant-subdomain');
  
  if (subdomain && !['www', 'app', 'api'].includes(subdomain)) {
    const session = await getServerSession(authOptions);
    if (session?.user) {
      redirect('/dashboard');
    } else {
      redirect('/auth/login');
    }
  }
  
  return <LandingClient />;
}

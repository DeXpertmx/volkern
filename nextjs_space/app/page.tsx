import React from 'react';
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

export default function LandingPage() {
  return <LandingClient />;
}

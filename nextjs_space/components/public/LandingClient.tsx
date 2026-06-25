'use client'

import React from 'react';
import ProductosLanding from '@/components/public/ProductosLanding';
import { PublicLayout } from '@/components/public/PublicLayout';

export default function LandingClient() {
  return (
    <PublicLayout>
      <ProductosLanding />
    </PublicLayout>
  );
}

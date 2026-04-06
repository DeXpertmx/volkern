'use client';

import { DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function BillingManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Billing Global</h1>
        <p className="text-gray-500 mt-1">Gestión de transacciones y facturación</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transacciones Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <DollarSign size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">Integración de Stripe próximamente</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

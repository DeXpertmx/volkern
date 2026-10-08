import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { exigirHub } from '@/lib/module-guard';
import ComprasTabs from '@/components/compras/ComprasTabs';

/**
 * Hub de Compras: pedidos a proveedor, recepciones y proveedores.
 *
 * La guardia corre en el servidor con la misma regla que decide el menú
 * (`exigirHub`), así que escribir la URL a mano sin el módulo activo no abre la
 * pantalla — el mismo caso que dejó alcanzables otros hubs escondidos.
 */
export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  await exigirHub('compras');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Compras</h1>
          <p className="text-muted-foreground mt-1">
            Pedidos a proveedor, recepción de mercancía y coste en contabilidad
          </p>
        </div>
      </div>

      <ComprasTabs />

      {children}
    </div>
  );
}

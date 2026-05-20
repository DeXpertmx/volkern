import { CartDrawer } from '@/components/tienda/CartDrawer';

export default function TiendaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
      <CartDrawer tenant={params.tenant} />
    </div>
  );
}

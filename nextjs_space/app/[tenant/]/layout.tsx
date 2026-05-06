import React from 'react';

export default function TenantLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  return (
    <div className="tenant-context">
      {children}
    </div>
  );
}

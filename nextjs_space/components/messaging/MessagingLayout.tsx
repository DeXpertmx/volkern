'use client';

import React from 'react';

export function MessagingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-white">
      {children}
    </div>
  );
}

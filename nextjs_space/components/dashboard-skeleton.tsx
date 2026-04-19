import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Mocking a 2-row layout */}
        <div className="col-span-12 md:col-span-6 h-96 bg-muted/20 animate-pulse rounded-xl" />
        <div className="col-span-12 md:col-span-6 h-96 bg-muted/20 animate-pulse rounded-xl" />
        <div className="col-span-12 h-32 bg-muted/20 animate-pulse rounded-xl" />
        <div className="col-span-12 md:col-span-4 h-64 bg-muted/20 animate-pulse rounded-xl" />
        <div className="col-span-12 md:col-span-8 h-64 bg-muted/20 animate-pulse rounded-xl" />
      </div>
    </div>
  );
}

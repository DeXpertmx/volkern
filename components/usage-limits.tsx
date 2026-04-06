
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Users, Mail, Zap, Database, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface UsageData {
  leads: { current: number; max: number };
  users: { current: number; max: number };
  emails_per_month: { current: number; max: number };
  automations: { current: number; max: number };
  storage_gb: { current: number; max: number };
}

export function UsageLimits() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();
      setUsage(data.usage);
    } catch (error) {
      console.error('Error fetching usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPercentage = (current: number, max: number) => {
    if (max === -1) return 0; // Ilimitado
    return Math.min((current / max) * 100, 100);
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading || !usage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Uso de Recursos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-2 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const resources = [
    {
      icon: Database,
      label: 'Leads',
      current: usage.leads.current,
      max: usage.leads.max,
      color: 'text-blue-600'
    },
    {
      icon: Users,
      label: 'Usuarios',
      current: usage.users.current,
      max: usage.users.max,
      color: 'text-purple-600'
    },
    {
      icon: Mail,
      label: 'Emails (este mes)',
      current: usage.emails_per_month.current,
      max: usage.emails_per_month.max,
      color: 'text-green-600'
    },
    {
      icon: Zap,
      label: 'Automatizaciones',
      current: usage.automations.current,
      max: usage.automations.max,
      color: 'text-orange-600'
    }
  ];

  const hasWarning = resources.some(
    (r) => r.max !== -1 && getPercentage(r.current, r.max) >= 90
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Uso de Recursos</CardTitle>
            <CardDescription>Consumo actual de tu plan</CardDescription>
          </div>
          {hasWarning && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Límite cercano
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {resources.map((resource, index) => {
          const percentage = getPercentage(resource.current, resource.max);
          const isUnlimited = resource.max === -1;

          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <resource.icon className={`h-4 w-4 ${resource.color}`} />
                  <span className="text-sm font-medium">{resource.label}</span>
                </div>
                <span className={`text-sm font-semibold ${getStatusColor(percentage)}`}>
                  {resource.current} {isUnlimited ? '' : `/ ${resource.max}`}
                  {isUnlimited && (
                    <Badge variant="secondary" className="ml-2">
                      Ilimitado
                    </Badge>
                  )}
                </span>
              </div>
              {!isUnlimited && (
                <div className="relative">
                  <Progress 
                    value={percentage} 
                    className="h-2"
                  />
                  <div
                    className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor(percentage)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {hasWarning && (
          <div className="pt-4 border-t">
            <p className="text-sm text-gray-600 mb-3">
              Has alcanzado o estás cerca del límite de algunos recursos.
            </p>
            <Link href="/dashboard/configuracion/billing">
              <Button size="sm" variant="outline" className="w-full">
                Actualizar Plan
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

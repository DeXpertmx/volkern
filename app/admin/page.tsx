
'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  DollarSign,
  Target,
  BookOpen,
  GraduationCap,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Analytics {
  overview: {
    totalTenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    totalMRR: number;
    totalUsers: number;
    totalLeads: number;
    totalCourses: number;
    totalStudents: number;
  };
  metrics: {
    newTenants: number;
    churnRate: number;
    growthRate: number;
    avgLeadsPerTenant: number;
  };
  mrrByCurrency: Array<{ currency: string; total: number }>;
  recentActivity: Array<{ date: string; count: number }>;
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    try {
      const res = await fetch(`/api/admin/analytics?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!analytics) {
    return <div>Error al cargar analytics</div>;
  }

  const stats = [
    {
      name: 'Total Tenants',
      value: analytics.overview.totalTenants,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      name: 'Tenants Activos',
      value: analytics.overview.activeTenants,
      icon: Building2,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      name: 'MRR Total',
      value: `$${analytics.overview.totalMRR.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      name: 'Growth Rate',
      value: `${analytics.metrics.growthRate}%`,
      icon: analytics.metrics.growthRate >= 0 ? TrendingUp : TrendingDown,
      color: analytics.metrics.growthRate >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: analytics.metrics.growthRate >= 0 ? 'bg-green-100' : 'bg-red-100'
    },
    {
      name: 'Usuarios Totales',
      value: analytics.overview.totalUsers,
      icon: Users,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100'
    },
    {
      name: 'Leads Totales',
      value: analytics.overview.totalLeads,
      icon: Target,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    },
    {
      name: 'Cursos Totales',
      value: analytics.overview.totalCourses,
      icon: BookOpen,
      color: 'text-pink-600',
      bgColor: 'bg-pink-100'
    },
    {
      name: 'Estudiantes Totales',
      value: analytics.overview.totalStudents,
      icon: GraduationCap,
      color: 'text-teal-600',
      bgColor: 'bg-teal-100'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Global</h1>
          <p className="text-gray-500 mt-1">Volkern Admin Backoffice</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.name}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={`${stat.bgColor} p-3 rounded-lg`}>
                    <Icon className={stat.color} size={24} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR by Currency */}
        <Card>
          <CardHeader>
            <CardTitle>MRR por Moneda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.mrrByCurrency.map((item) => (
                <div key={item.currency} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-gray-400" />
                    <span className="font-medium">{item.currency}</span>
                  </div>
                  <span className="text-lg font-bold">
                    ${item.total.toLocaleString()}
                  </span>
                </div>
              ))}
              {analytics.mrrByCurrency.length === 0 && (
                <p className="text-gray-500 text-center py-4">No hay datos de MRR</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Métricas Clave</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Nuevos Tenants</span>
                <span className="text-2xl font-bold text-green-600">
                  {analytics.metrics.newTenants}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Churn Rate</span>
                <span className="text-2xl font-bold text-red-600">
                  {analytics.metrics.churnRate}%
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Avg. Leads/Tenant</span>
                <span className="text-2xl font-bold text-blue-600">
                  {analytics.metrics.avgLeadsPerTenant}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Distribución de Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-700">Activos</p>
              <p className="text-3xl font-bold text-green-900 mt-2">
                {analytics.overview.activeTenants}
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-700">En Trial</p>
              <p className="text-3xl font-bold text-blue-900 mt-2">
                {analytics.overview.trialTenants}
              </p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm font-medium text-yellow-700">Suspendidos</p>
              <p className="text-3xl font-bold text-yellow-900 mt-2">
                {analytics.overview.suspendedTenants}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-700">Total</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {analytics.overview.totalTenants}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      {analytics.recentActivity && analytics.recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente (Últimos 7 días)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.recentActivity.map((activity: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="text-sm font-medium">
                      {new Date(activity.date).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">
                    {activity.count} nuevo{activity.count !== 1 ? 's' : ''} tenant{activity.count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

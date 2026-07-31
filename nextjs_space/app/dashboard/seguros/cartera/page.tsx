'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { PortfolioBriefing } from '@/components/insurance/PortfolioBriefing';
import { MapaCartera } from '@/components/insurance/MapaCartera';

export default function CarteraPage() {
  const router = useRouter();
  const [briefing, setBriefing] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [activeTab, setActiveTab] = useState<'briefing' | 'mapa'>('briefing');

  const loadData = useCallback(async () => {
    setLoadingBriefing(true);
    setLoadingStats(true);

    try {
      const [briefingRes, statsRes] = await Promise.all([
        apiFetch('/api/insurance/portfolio/briefing'),
        apiFetch('/api/insurance/portfolio/stats'),
      ]);

      if (briefingRes.ok) {
        const data = await briefingRes.json();
        setBriefing(data);
      } else {
        toast.error('Error al cargar el briefing');
      }
      setLoadingBriefing(false);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      } else {
        toast.error('Error al cargar estadísticas');
      }
      setLoadingStats(false);
    } catch (error) {
      console.error('Error cargando datos de cartera:', error);
      toast.error('Error al cargar datos de cartera');
      setLoadingBriefing(false);
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePolizaClick = (id: string) => {
    router.push('/dashboard/seguros/polizas');
  };

  return (
    <div className="space-y-6">
      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('briefing')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'briefing'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📋 Briefing Diario
        </button>
        <button
          onClick={() => setActiveTab('mapa')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'mapa'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📊 Mapa de Cartera
        </button>
      </div>

      {/* Content */}
      {activeTab === 'briefing' ? (
        briefing ? (
          <PortfolioBriefing
            briefing={briefing}
            loading={loadingBriefing}
            onRefresh={loadData}
            onPolizaClick={handlePolizaClick}
          />
        ) : (
          <PortfolioBriefing
            briefing={{
              generado: new Date().toISOString(),
              resumen: {
                totalPolizasActivas: 0, renovacionesProximas: 0,
                urgentes: 0, proximas: 0, futuras: 0, vencidas: 0,
                clientesSinContacto: 0, oportunidadesCrossSell: 0,
                valorEnRiesgo: 0, valorUrgente: 0,
              },
              detalle: { urgentes: [], vencidas: [], clientesRiesgo: [], oportunidades: [] },
              acciones: ['Cargando análisis...'],
            }}
            loading={loadingBriefing}
            onRefresh={loadData}
          />
        )
      ) : (
        <MapaCartera
          stats={stats || {
            totalPolizas: 0, primaTotal: 0, totalClientes: 0,
            clientesSinContacto: 0, tasaRenovacion: 100, oportunidadesIA: 0,
            distribucionRamo: {}, renovacionesPorMes: {}, topAseguradoras: [],
          }}
          loading={loadingStats}
        />
      )}
    </div>
  );
}

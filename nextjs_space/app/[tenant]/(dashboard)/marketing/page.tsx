'use client';

import React, { useEffect, useState } from 'react';
import { MetricCard } from '@/components/marketing/MetricCard';
import { QueueStatusCard } from '@/components/marketing/QueueStatusCard';
import { SocialConnectorButton } from '@/components/marketing/SocialConnectorButton';
import { GemmaPromptUI } from '@/components/marketing/GemmaPromptUI';
import { GemmaMarketingAdvisor } from '@/components/marketing/GemmaAdvisor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Send, Target, BarChart3, Megaphone, Share2, Layers } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export default function MarketingDashboard() {
  const [queueStatus, setQueueStatus] = useState<any[]>([]);
  const [socialConfigs, setSocialConfigs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [qRes, sRes] = await Promise.all([
          fetch('/api/marketing/queues/status'),
          fetch('/api/marketing/social/status') // Necesito crear este endpoint
        ]);
        
        if (qRes.ok) setQueueStatus(await qRes.json());
        // if (sRes.ok) setSocialConfigs(await sRes.json());
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="p-8 space-y-8 bg-slate-50/30 min-h-screen">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Hub de Marketing</h1>
          <p className="text-muted-foreground mt-1">Gestión centralizada de Social Ops, Campañas e Inteligencia Artificial.</p>
        </div>
        <div className="flex space-x-3">
          <div className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>SISTEMA ONLINE</span>
          </div>
        </div>
      </div>

      {/* Métricas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Leads Captados (Hoy)" 
          value="24" 
          variation={12} 
          icon={<Users className="text-blue-600" />} 
        />
        <MetricCard 
          title="Campañas Activas" 
          value="8" 
          variation={0} 
          icon={<Megaphone className="text-purple-600" />} 
        />
        <MetricCard 
          title="Engagement Social" 
          value="4.2%" 
          variation={-2.5} 
          icon={<Share2 className="text-emerald-600" />} 
        />
        <MetricCard 
          title="Tasa de Conversión" 
          value="18.5%" 
          variation={5.4} 
          icon={<Target className="text-rose-600" />} 
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-white border p-1 rounded-xl shadow-sm">
          <TabsTrigger value="overview" className="rounded-lg">Vista General</TabsTrigger>
          <TabsTrigger value="social" className="rounded-lg">Social Ops</TabsTrigger>
          <TabsTrigger value="queues" className="rounded-lg">Monitor de Colas</TabsTrigger>
          <TabsTrigger value="ai" className="rounded-lg">Gemma 4 AI</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <GemmaPromptUI />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queueStatus.slice(0, 2).map(q => (
                  <QueueStatusCard key={q.name} name={q.name} counts={q.counts} />
                ))}
              </div>
            </div>

            <div className="space-y-6">
               <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
                  <h3 className="font-bold text-sm flex items-center">
                    <Layers className="w-4 h-4 mr-2 text-indigo-600" />
                    CONECTORES SOCIALES
                  </h3>
                  <div className="space-y-3">
                    <SocialConnectorButton 
                      platform="LINKEDIN" 
                      isConnected={true} 
                      profileName="Volkern Enterprise" 
                      onConnect={() => {}} 
                      onDisconnect={() => {}} 
                    />
                    <SocialConnectorButton 
                      platform="YOUTUBE" 
                      isConnected={false} 
                      onConnect={() => {}} 
                      onDisconnect={() => {}} 
                    />
                    <SocialConnectorButton 
                      platform="TIKTOK" 
                      isConnected={false} 
                      onConnect={() => {}} 
                      onDisconnect={() => {}} 
                    />
                  </div>
               </div>

               <GemmaMarketingAdvisor />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="queues" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {queueStatus.map(q => (
              <QueueStatusCard key={q.name} name={q.name} counts={q.counts} />
            ))}
          </div>
          {/* Aquí iría la tabla detallada de errores */}
        </TabsContent>
        
        {/* Otros TabsContent irían aquí */}
      </Tabs>
    </div>
  );
}

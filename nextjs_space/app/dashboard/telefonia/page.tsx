'use client';

import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  Plus, 
  MoreHorizontal, 
  ChevronRight, 
  Info,
  Dialpad
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CallSummaryCards } from '@/components/telephony/CallSummaryCards';
import { CallHistoryTable } from '@/components/telephony/CallHistoryTable';
import { TelephonyDialer } from '@/components/telephony/TelephonyDialer';
import { ActiveCallStatus } from '@/components/telephony/ActiveCallStatus';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

export default function TelephonyDashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState({ balance: '0.00', currency: 'USD' });
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [showDialer, setShowDialer] = useState(false);
  const [activeCall, setActiveCall] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchCalls();
    fetchBalance();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/integrations/telephony/stats?range=30');
      const data = await response.json();
      if (response.ok) setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchCalls = async (status = 'all') => {
    setLoading(true);
    try {
      const response = await fetch(`/api/integrations/telephony/calls?status=${status}`);
      const data = await response.json();
      if (response.ok) setCalls(data.calls || []);
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async () => {
    setBalanceLoading(true);
    try {
      const response = await fetch('/api/integrations/telephony/balance');
      const data = await response.json();
      if (response.ok) setBalance(data);
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    fetchCalls(value);
  };

  // Mock function to simulate an active call for demonstration
  const simulateCall = () => {
    setActiveCall({
      number: '+58 412 123 4567',
      location: 'Venezuela',
      startTime: Date.now(),
      status: 'connected'
    });
    setShowDialer(false);
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">
            CRM <ChevronRight size={12} /> Comunicación
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <span className="p-2.5 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-600/20">
              <Phone size={28} />
            </span>
            Telefonía Inteligente
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="h-12 border-slate-200 bg-white shadow-sm gap-2 px-6"
            onClick={() => setShowDialer(!showDialer)}
          >
            <Phone size={18} className="text-blue-600" /> Marcador
          </Button>
          <Button className="h-12 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/20 gap-2 px-6">
            <Plus size={18} /> Nueva llamada
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <CallSummaryCards 
        stats={{ ...stats, ...balance }} 
        balanceLoading={balanceLoading} 
      />

      {/* Main Content */}
      <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          <Tabs defaultValue="all" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="px-6 pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-0">
              <h2 className="text-xl font-bold text-slate-900">Lista de llamadas</h2>
              <TabsList className="bg-slate-100/50 p-1 mb-0 border-b-none translate-y-[1px]">
                <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Todas</TabsTrigger>
                <TabsTrigger value="received" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Recibidas</TabsTrigger>
                <TabsTrigger value="realized" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Realizadas</TabsTrigger>
                <TabsTrigger value="missed" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Perdidas</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6">
              <TabsContent value={activeTab} className="mt-0 outline-none">
                <CallHistoryTable calls={calls} loading={loading} />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Floating Dialer Overlay */}
      {showDialer && (
        <div className="fixed top-24 right-12 z-50">
          <TelephonyDialer onClose={() => setShowDialer(false)} />
        </div>
      )}

      {/* Active Call UI */}
      <ActiveCallStatus 
        call={activeCall} 
        onHangup={() => setActiveCall(null)} 
      />
    </div>
  );
}

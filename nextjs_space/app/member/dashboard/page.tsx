'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  FileText, 
  Users, 
  Settings, 
  LogOut,
  Bell,
  Search,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  History,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/customer/auth/me');
        if (!response.ok) throw new Error('No autorizado');
        const data = await response.json();
        // Here we would normally fetch the full user profile
        setUser({
          firstName: 'Cliente',
          lastName: 'Soberano',
          email: 'cliente_test@volkern.com',
          role: 'ADMIN'
        });
      } catch (error) {
        router.push('/member/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/customer/auth/logout', { method: 'POST' });
    toast.success('Sesión cerrada');
    router.push('/member/login');
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center animate-pulse">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>
        <p className="text-slate-500 font-medium">Cargando Bóveda...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-white p-6 hidden lg:block">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <span className="font-black text-xl italic tracking-tight">VOLKERN</span>
        </div>

        <nav className="space-y-2">
          <NavItem icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" active />
          <NavItem icon={<Package className="w-5 h-5" />} label="Mis Pedidos" />
          <NavItem icon={<Truck className="w-5 h-5" />} label="Entregas" />
          <NavItem icon={<FileText className="w-5 h-5" />} label="Documentos" />
          <NavItem icon={<Users className="w-5 h-5" />} label="Organización" />
          <NavItem icon={<History className="w-5 h-5" />} label="Seguridad" />
        </nav>

        <div className="absolute bottom-10 left-6 right-6">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/5 h-12 rounded-xl"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Panel de Control</h1>
            <p className="text-slate-500">Bienvenido a tu ecosistema soberano.</p>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" className="rounded-xl border-slate-200">
              <Bell className="w-5 h-5 text-slate-500" />
            </Button>
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-black text-slate-900">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-slate-500">{user.role}</p>
              </div>
              <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                <AvatarFallback className="bg-primary text-white font-bold">CS</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard label="Pedidos Activos" value="04" subValue="+2 esta semana" color="primary" />
          <StatCard label="Entregas Pendientes" value="02" subValue="Estimado hoy" color="blue" />
          <StatCard label="Documentos" value="12" subValue="3 nuevos" color="emerald" />
          <StatCard label="Incidencias" value="01" subValue="En revisión" color="amber" />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Orders */}
          <Card className="lg:col-span-2 rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white">
            <CardHeader className="p-8 pb-0 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-slate-900">Pedidos Recientes</CardTitle>
                <CardDescription>Resumen de tus últimas transacciones.</CardDescription>
              </div>
              <Button variant="outline" className="rounded-xl border-slate-200 text-xs font-bold">Ver Todo</Button>
            </CardHeader>
            <CardContent className="p-8 pt-6">
              <div className="space-y-4">
                <OrderItem id="SO-2026-001" status="SHIPPED" date="Hoy, 10:30" amount="$1,500.00" />
                <OrderItem id="SO-2026-002" status="PROCESSING" date="Ayer" amount="$2,850.00" />
                <OrderItem id="SO-2025-098" status="DELIVERED" date="15 Abr 2026" amount="$940.00" />
              </div>
            </CardContent>
          </Card>

          {/* Org & Security */}
          <div className="space-y-8">
            <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-slate-900 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <ShieldCheck className="w-24 h-24" />
              </div>
              <CardContent className="p-8">
                <h3 className="text-xl font-black mb-2">Seguridad Soberana</h3>
                <p className="text-slate-400 text-sm mb-6">Tu sesión está protegida por encriptación de extremo a extremo.</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold">Sesión Activa</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Madrid, ES</span>
                  </div>
                  <Button className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-10 rounded-xl text-xs">
                    Auditar Dispositivos
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Tu Equipo</h3>
                    <p className="text-xs text-slate-500">03 usuarios activos</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full h-12 rounded-xl border-slate-200 text-slate-600 font-bold flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Invitar Miembro
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: any, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
      {icon}
      <span className="font-bold text-sm">{label}</span>
    </div>
  );
}

function StatCard({ label, value, subValue, color }: any) {
  const colors: any = {
    primary: 'text-primary bg-primary/10',
    blue: 'text-blue-500 bg-blue-50',
    emerald: 'text-emerald-500 bg-emerald-50',
    amber: 'text-amber-500 bg-amber-50'
  };
  return (
    <Card className="rounded-3xl border-none shadow-md bg-white p-6">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <div className="text-3xl font-black text-slate-900 mb-1">{value}</div>
      <p className="text-[10px] text-slate-500 font-medium">{subValue}</p>
    </Card>
  );
}

function OrderItem({ id, status, date, amount }: any) {
  const statusColors: any = {
    SHIPPED: 'bg-blue-50 text-blue-600',
    PROCESSING: 'bg-amber-50 text-amber-600',
    DELIVERED: 'bg-emerald-50 text-emerald-600'
  };
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-transparent hover:border-slate-100 transition-all cursor-pointer group">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
          <Package className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">{id}</p>
          <p className="text-[10px] text-slate-500">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Badge className={`${statusColors[status]} border-none text-[10px] font-bold`}>{status}</Badge>
        <span className="text-sm font-black text-slate-900">{amount}</span>
        <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
      </div>
    </div>
  );
}

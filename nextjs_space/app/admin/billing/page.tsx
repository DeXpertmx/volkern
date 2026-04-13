'use client';

import { BarChart3, Clock, TrendingDown, Target, Building2, ShieldCheck, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export default function BillingManagement() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Billing Global</h1>
        <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Revenue & Transaction Hub</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Proyección Mensual', val: '€12,450.00', trend: '+12%', icon: BarChart3 },
          { label: 'Facturación Pendiente', val: '€1,200.00', trend: '3 Casos', icon: Clock },
          { label: 'Churn Estimado', val: '1.2%', trend: '-0.3%', icon: TrendingDown }
        ].map((item, i) => (
          <Card key={i} className="border border-[#E2E8F0] shadow-sm rounded-3xl bg-white overflow-hidden p-6 hover:shadow-xl transition-all duration-500 group">
             <div className="flex items-center justify-between mb-4">
               <p className="text-[10px] font-black uppercase text-[#4A5568] tracking-widest">{item.label}</p>
               <div className="p-2 rounded-xl bg-slate-50 text-[#1A365D] group-hover:bg-[#1A365D] group-hover:text-white transition-colors">
                  <item.icon size={16} />
               </div>
             </div>
             <p className="text-3xl font-black text-[#1A365D] tracking-tighter">{item.val}</p>
             <p className="text-[10px] font-bold text-emerald-500 mt-2">{item.trend} vs mes anterior</p>
          </Card>
        ))}
      </div>

      <Card className="border border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardHeader className="p-8 border-b border-slate-50 flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tight">Próximos Cobros Automatizados</CardTitle>
          <Badge className="bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest border-none px-4">Stripe API Ready</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-b border-slate-100 italic">
                <TableHead className="text-[10px] font-black uppercase tracking-widest h-14 pl-8">Tenant</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest h-14">Plan</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest h-14">Siguiente Cobro</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest h-14">Monto</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest h-14 pr-8">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: 'SolarTech Mexico', plan: 'Enterprise', date: '15 Abr 2026', amount: '€199.00', status: 'READY' },
                { name: 'Energia Vital', plan: 'Growth', date: '18 Abr 2026', amount: '€99.00', status: 'READY' },
                { name: 'Volkern Test', plan: 'Starter', date: '20 Abr 2026', amount: '€49.00', status: 'TRIAL' }
              ].map((row, i) => (
                <TableRow key={i} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50">
                  <TableCell className="font-bold text-sm text-[#1A365D] pl-8 py-5">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-[#4A5568] uppercase">{row.plan}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-slate-500">{row.date}</TableCell>
                  <TableCell className="font-black text-[#1A365D]">{row.amount}</TableCell>
                  <TableCell className="text-right pr-8">
                     <Badge className={cn(
                       "text-[9px] font-black uppercase border-none px-3",
                       row.status === 'READY' ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                     )}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-12 text-center border-t border-slate-50 bg-slate-50/10">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <ShieldCheck className="text-[#1A365D]" size={32} />
              </div>
              <h4 className="text-lg font-black text-[#1A365D] uppercase tracking-tight">Capa de Facturación Protegida</h4>
              <p className="text-xs text-[#4A5568] font-bold leading-relaxed opacity-60">Los datos de pago están cifrados mediante AES-256 en la Bóveda de Finanzas Volkern. Próximamente integración nativa con Stripe Connect.</p>
              <Button disabled className="rounded-xl h-10 px-8 bg-slate-100 text-slate-400 font-black uppercase tracking-widest text-[9px] mt-4">Configurar Pasarelas</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}

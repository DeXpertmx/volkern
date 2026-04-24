'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  Send, 
  ShieldCheck, 
  ExternalLink,
  Code2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FiscalPreviewerProps {
  xmlUrl?: string;
  pdfUrl?: string;
  invoiceNumber: string;
  fiscalUuid?: string;
}

export function FiscalPreviewer({ xmlUrl, pdfUrl, invoiceNumber, fiscalUuid }: FiscalPreviewerProps) {
  const [showXml, setShowXml] = useState(false);

  // Simulación de XML de CFDI 4.0 para previsualización nativa
  const mockXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante Version="4.0" Serie="F" Folio="${invoiceNumber}" ...>
  <cfdi:Emisor Rfc="VOLK800101ABC" Nombre="VOLKERN SOLUTIONS SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="RECP900101XYZ" Nombre="CLIENTE EJEMPLO" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="80101501" Cantidad="1" ValorUnitario="1000.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="${fiscalUuid || '4E72B5E2-...'}" FechaTimbrado="2026-04-24T..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

  return (
    <Card className="border-none shadow-xl bg-slate-900 text-white overflow-hidden">
      <CardHeader className="bg-white/5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight">Visor Fiscal Nativo</CardTitle>
              <CardDescription className="text-slate-400">Factura legal ${invoiceNumber}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
              <ShieldCheck className="h-3 w-3 mr-1" /> CFDI 4.0 Timbrado
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="aspect-[4/5] w-full bg-slate-800 relative group">
          {/* Simulación de PDF Embebido */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-12 text-center space-y-4">
             <div className="h-32 w-24 bg-slate-700/50 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center">
                <FileText className="h-12 w-12 opacity-20" />
             </div>
             <p className="text-xs font-bold uppercase tracking-widest opacity-50">Previsualización de PDF Segura</p>
          </div>
          
          <iframe 
            src={pdfUrl || "#"} 
            className="w-full h-full relative z-10 border-none"
            title="Factura PDF"
          />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl transition-all">
             <Button size="sm" variant="ghost" className="rounded-xl text-white hover:bg-white/10">
               <Download className="h-4 w-4 mr-2" /> PDF
             </Button>
             <div className="w-px h-4 bg-white/20" />
             <Button size="sm" variant="ghost" className="rounded-xl text-white hover:bg-white/10">
               <Download className="h-4 w-4 mr-2" /> XML
             </Button>
             <div className="w-px h-4 bg-white/20" />
             <Button size="sm" className="bg-primary text-white hover:bg-primary/90 rounded-xl px-6">
               <Send className="h-4 w-4 mr-2" /> Reenviar
             </Button>
          </div>
        </div>

        {/* XML Raw Toggle */}
        <div className="border-t border-white/10">
          <Button 
            variant="ghost" 
            className="w-full rounded-none py-4 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-bold uppercase tracking-[0.2em]"
            onClick={() => setShowXml(!showXml)}
          >
            {showXml ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
            {showXml ? 'Ocultar XML Estructurado' : 'Ver XML de Timbrado'}
          </Button>
          
          {showXml && (
            <div className="p-6 bg-black/50 animate-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 mb-4 text-emerald-400">
                <Code2 className="h-4 w-4" />
                <span className="text-[10px] font-black tracking-widest uppercase">Estructura Legal XML</span>
              </div>
              <pre className="text-[10px] font-mono text-slate-400 overflow-x-auto p-4 bg-white/5 rounded-xl border border-white/5">
                {mockXml}
              </pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

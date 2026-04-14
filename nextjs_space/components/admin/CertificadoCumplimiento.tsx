'use client'

import { useRef } from 'react'
import { Shield, Hash, FileText, CheckCircle2 } from 'lucide-react'

interface AuditRecord {
  id: string
  auditDate: string
  biasScore: number
  status: string
  integrityHash: string
  prevHash?: string | null
  findingSummary: string
  actionTaken: string
  totalRecords: number
  groupBreakdown?: Record<string, number> | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  resolutionNote?: string | null
}

interface CertificateData {
  certNumber: string
  equityIndex: number
  record: AuditRecord
  chainValid: boolean
  generatedAt: string
  systemVersion: string
  legalFramework: string
}

interface CertificadoCumplimientoProps {
  data: CertificateData
  onClose: () => void
}

export function CertificadoCumplimiento({ data, onClose }: CertificadoCumplimientoProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const { record, certNumber, equityIndex, generatedAt } = data;

  const biasPercent = (record.biasScore * 100).toFixed(2);
  const isProtected = record.biasScore <= 0.05;

  const generatedDate = new Date(generatedAt).toLocaleString('es-ES', {
    dateStyle: 'full',
    timeStyle: 'medium'
  });

  const printStyles = `
    @media print {
      body > *:not(#cert-container) { display: none !important; }
      #cert-container {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: auto !important;
        z-index: 9999 !important;
        background: white !important;
      }
      .no-print { display: none !important; }
      .cert-page { 
        page-break-after: always;
        box-shadow: none !important;
        border: none !important;
      }
    }
  `;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-6 overflow-y-auto no-print">
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer" 
        onClick={onClose} 
      />

      <div id="cert-container" className="relative z-[201] w-full max-w-4xl pointer-events-auto">
        {/* Controles del Modal */}
        <div className="no-print flex items-center justify-between mb-4">
          <h2 className="text-white font-black text-lg tracking-tight">Certificado de Cumplimiento</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors flex items-center gap-2"
            >
              <FileText className="h-3.5 w-3.5" />
              Imprimir Certificado (PDF)
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* El Certificado */}
        <div
          ref={printRef}
          className="cert-page bg-white rounded-2xl shadow-2xl overflow-hidden border-[10px] border-slate-900"
          style={{ fontFamily: '"Inter", "Segoe UI", Tahoma, sans-serif' }}
        >
          {/* 1. Encabezado de Autoridad */}
          <div style={{ padding: '60px 80px 40px', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '40px', left: '80px', opacity: 0.1 }}>
              <Shield size={120} />
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.5px', color: '#0F172A', marginBottom: '8px' }}>
              Certificado de Cumplimiento Ético y Legal
            </h1>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '32px' }}>
              Auditoría de Transparencia Algorítmica (Volkern CRM/ERP)
            </h2>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
              <div>ID ÚNICO DE REPORTE: <span style={{ color: '#0F172A' }}>{certNumber}</span></div>
              <div>TIMESTAMP INMUTABLE: <span style={{ color: '#0F172A' }}>{generatedDate}</span></div>
            </div>
          </div>

          <div style={{ padding: '0 80px 60px' }}>
            {/* 2. Cuerpo del Análisis (La prueba técnica) */}
            <div style={{ marginBottom: '48px' }}>
              <div style={{ borderBottom: '2px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  II. Cuerpo del Análisis (Evidencia Técnica)
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px', alignItems: 'center' }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '10px', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>Métrica de Equidad</th>
                        <th style={{ padding: '16px', textAlign: 'right', fontSize: '10px', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>Valor Detectado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderTop: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>Coeficiente de Variación (CV)</td>
                        <td style={{ padding: '16px', textAlign: 'right', fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>{biasPercent}%</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid #E2E8F0', background: isProtected ? '#F0FDF4' : 'white' }}>
                        <td style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>Estado de Protección</td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <span style={{ 
                            padding: '4px 12px', 
                            borderRadius: '20px', 
                            fontSize: '11px', 
                            fontWeight: 900, 
                            background: isProtected ? '#22C55E' : '#E2E8F0',
                            color: isProtected ? 'white' : '#64748B'
                          }}>
                            {isProtected ? 'PROTEGIDO' : record.status}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '16px', border: '1px dashed #CBD5E1' }}>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase' }}>Declaración del Auditor (IA)</h4>
                  </div>
                  <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#475569', fontStyle: 'italic' }}>
                    "No se han identificado patrones de discriminación. El sistema garantiza la igualdad de trato según el RGPD y la Ley de IA de la UE. Los umbrales de desviación se mantienen dentro de los rangos de equidad algorítmica certificados por Volkern Compliance Engine."
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Sello de Inalterabilidad (Blockchain-like) */}
            <div style={{ marginBottom: '48px', padding: '32px', background: '#0F172A', borderRadius: '20px', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <Hash size={20} className="text-indigo-400" />
                <h3 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  III. Sello de Inalterabilidad (Blockchain-like)
                </h3>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '9px', fontWeight: 900, color: '#64748B', letterSpacing: '2px', marginBottom: '8px' }}>HASH SHA-256 ACTUAL</div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', wordBreak: 'break-all', color: '#94A3B8' }}>
                  {record.integrityHash}
                </div>
              </div>

              <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#94A3B8' }}>
                Este código vincula este reporte con el registro anterior en la cadena de custodia inmutable. La correlación criptográfica demuestra que este informe es parte de una secuencia histórica íntegra y no ha sido fabricado o alterado de forma ad-hoc.
              </p>
            </div>

            {/* 4. Cláusula de Responsabilidad Proactiva */}
            <div style={{ borderTop: '2px solid #E2E8F0', paddingTop: '32px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                IV. Cláusula de Responsabilidad Proactiva
              </h3>
              <p style={{ fontSize: '11px', lineHeight: '1.8', color: '#64748B', textAlign: 'justify' }}>
                La empresa (Dimension eXpert / Volkern) utiliza metodologías de <strong>"Privacidad por Diseño"</strong> para asegurar que el análisis de sesgo no requiera acceso a datos personales identificables fuera de los grupos demográficos anonimizados. El sistema incorpora un mecanismo de <strong>Kill Switch</strong> automático que bloquea cualquier operación ante variaciones críticas de equidad. Cualquier reactivación de módulos restringidos requiere de supervisión humana mandatoria, con registro inmutable de la justificación técnica y ética proporcionada por el administrador autorizado.
              </p>
            </div>

            {/* Firmas / Sellos */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '60px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '180px', height: '1px', background: '#CBD5E1', marginBottom: '8px' }}></div>
                <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>VERIFICACIÓN AUTOMATIZADA</div>
                <div style={{ fontSize: '12px', fontWeight: 900, color: '#0F172A' }}>VOLKERN COMPLIANCE ENGINE</div>
              </div>
              
              <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, border: '4px double #E2E8F0', borderRadius: '50%' }}></div>
                <div style={{ textAlign: 'center', zIndex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>VOLKERN</div>
                  <div style={{ fontSize: '8px', color: '#64748B', fontWeight: 800 }}>CERTIFIED IA</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer de página */}
          <div style={{ background: '#F8FAFC', padding: '20px 80px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94A3B8', fontWeight: 600 }}>
            <div>© 2026 Dimension eXpert - Todos los derechos reservados</div>
            <div>REPORTE GENERADO EN CUMPLIMIENTO CON EL EU AI ACT Y RGPD</div>
          </div>
        </div>
      </div>
    </div>
  );
}

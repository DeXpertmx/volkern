'use client'

import { useEffect, useRef } from 'react'
import { Shield, CheckCircle2, AlertCircle, Hash, Calendar, FileText, Lock } from 'lucide-react'

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
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const { record, certNumber, equityIndex, chainValid, generatedAt, systemVersion, legalFramework } = data

  const statusColor = record.status === 'VERDE'
    ? '#059669'
    : record.status === 'AMARILLO'
      ? '#D97706'
      : '#DC2626'

  const biasPercent = (record.biasScore * 100).toFixed(2)
  const auditDate = new Date(record.auditDate).toLocaleString('es-ES', {
    dateStyle: 'full', timeStyle: 'medium'
  })
  const generatedDate = new Date(generatedAt).toLocaleString('es-ES', {
    dateStyle: 'full', timeStyle: 'medium'
  })

  return (
    <>
      {/* Estilos CSS de impresión */}
      <style>{`
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
          }
        }
      `}</style>

      {/* Overlay */}
      <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto no-print" onClick={onClose} />

      {/* Panel de control */}
      <div id="cert-container" className="fixed inset-0 z-[201] flex items-start justify-center p-6 pointer-events-none overflow-y-auto">
        <div className="pointer-events-auto w-full max-w-4xl">
          {/* Controles superiores — no se imprimen */}
          <div className="no-print flex items-center justify-between mb-4">
            <h2 className="text-white font-black text-lg tracking-tight">Certificado de Cumplimiento</h2>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors flex items-center gap-2"
              >
                <FileText className="h-3.5 w-3.5" />
                Descargar / Imprimir PDF
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
            className="cert-page bg-white rounded-2xl shadow-2xl overflow-hidden border-4 border-slate-900"
            style={{ fontFamily: '"Times New Roman", Georgia, serif' }}
          >
            {/* Cabecera con membrete */}
            <div style={{ background: '#1A365D', padding: '32px 48px', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-1px', fontFamily: 'Arial, sans-serif' }}>
                    VOLKERN
                  </div>
                  <div style={{ fontSize: '10px', letterSpacing: '4px', opacity: 0.7, marginTop: '2px', fontFamily: 'Arial, sans-serif' }}>
                    ERP · GOVERNANCE · COMPLIANCE
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', opacity: 0.8, fontFamily: 'Arial, sans-serif' }}>N/REF: {certNumber}</div>
                  <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px', fontFamily: 'Arial, sans-serif' }}>
                    Emitido: {generatedDate}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '20px' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '2px', fontFamily: 'Arial, sans-serif' }}>
                  CERTIFICADO DE CUMPLIMIENTO ÉTICO — SISTEMA DE IA
                </div>
                <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px', fontFamily: 'Arial, sans-serif' }}>
                  {legalFramework}
                </div>
              </div>
            </div>

            {/* Cuerpo del certificado */}
            <div style={{ padding: '48px', color: '#1A202C' }}>
              
              {/* Declaración de conformidad */}
              <div style={{ marginBottom: '36px', padding: '24px', background: '#F7FAFC', borderLeft: '4px solid #1A365D', borderRadius: '8px' }}>
                <p style={{ fontSize: '13px', lineHeight: '1.8', color: '#2D3748' }}>
                  El sistema automatizado de auditoría de equidad algorítmica de <strong>Volkern ERP</strong>,
                  en cumplimiento con el <strong>Reglamento (UE) 2024/1689 (AI Act)</strong> y el 
                  <strong> Reglamento General de Protección de Datos (RGPD 2016/679)</strong>,
                  certifica que el análisis de sesgo demográfico del módulo de verificación de presencia
                  aleatoria ha sido ejecutado con los resultados que se detallan a continuación.
                </p>
              </div>

              {/* KPIs principales */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '36px' }}>
                {[
                  {
                    label: 'Índice de Equidad',
                    value: `${equityIndex}%`,
                    sub: record.status,
                    color: statusColor,
                  },
                  {
                    label: 'Coef. de Variación (Bias)',
                    value: `${biasPercent}%`,
                    sub: record.biasScore > 0.10 ? 'Alto' : record.biasScore > 0.05 ? 'Moderado' : 'Bajo',
                    color: statusColor,
                  },
                  {
                    label: 'Registros Auditados',
                    value: record.totalRecords.toLocaleString('es-ES'),
                    sub: 'Eventos analizados',
                    color: '#4A5568',
                  },
                  {
                    label: 'Acción Tomada',
                    value: record.actionTaken,
                    sub: record.actionTaken === 'NINGUNA' ? 'Sistema nominal' : 'Ver detalle',
                    color: record.actionTaken === 'BLOQUEO_PREVENTIVO' ? '#DC2626' : '#4A5568',
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    style={{
                      padding: '16px',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#718096', letterSpacing: '1px', marginBottom: '8px', fontFamily: 'Arial, sans-serif' }}>
                      {kpi.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: kpi.color, fontFamily: 'Arial, sans-serif' }}>
                      {kpi.value}
                    </div>
                    <div style={{ fontSize: '9px', color: '#718096', marginTop: '4px', fontFamily: 'Arial, sans-serif' }}>
                      {kpi.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Detalles de la auditoría */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '28px' }}>
                <thead>
                  <tr style={{ background: '#EDF2F7' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'Arial, sans-serif', letterSpacing: '1px', fontSize: '10px', color: '#4A5568' }}>CAMPO</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'Arial, sans-serif', letterSpacing: '1px', fontSize: '10px', color: '#4A5568' }}>VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Fecha de Auditoría', auditDate],
                    ['ID del Registro', record.id],
                    ['Estado del Sistema', record.status],
                    ['Resumen de Hallazgos', record.findingSummary],
                    ['Sistema de Auditoría', systemVersion],
                    ['Integridad de Cadena', chainValid ? '✅ Verificada — Hash encadenado válido' : '⚠️ No verificable — Primer registro o cadena rota'],
                    ...(record.resolvedBy ? [
                      ['Override Manual por', record.resolvedBy],
                      ['Fecha de Revisión', new Date(record.resolvedAt!).toLocaleString('es-ES')],
                      ['Justificación', record.resolutionNote || 'N/D'],
                    ] : []),
                  ].map(([campo, valor], i) => (
                    <tr key={campo} style={{ background: i % 2 === 0 ? 'white' : '#FAFAFA', borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '10px 16px', color: '#4A5568', fontWeight: 600, fontFamily: 'Arial, sans-serif', whiteSpace: 'nowrap' }}>{campo}</td>
                      <td style={{ padding: '10px 16px', color: '#1A202C', fontFamily: 'Arial, sans-serif' }}>{valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Sello de integridad SHA-256 */}
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '16px 20px', marginBottom: '28px' }}>
                <div style={{ fontSize: '10px', color: '#3B82F6', fontWeight: 700, letterSpacing: '2px', marginBottom: '8px', fontFamily: 'Arial, sans-serif' }}>
                  🔐 SELLO DIGITAL SHA-256 (ANTI-MANIPULACIÓN)
                </div>
                <div style={{ fontFamily: 'Courier New, monospace', fontSize: '11px', color: '#1E40AF', wordBreak: 'break-all', lineHeight: '1.6' }}>
                  <strong>Hash actual:</strong>&nbsp;{record.integrityHash}<br />
                  {record.prevHash && (
                    <><strong>Hash anterior:</strong>&nbsp;{record.prevHash}<br /></>
                  )}
                  <strong>Estado:</strong>&nbsp;{chainValid
                    ? 'Cadena de integridad verificada ✅ — Este reporte no ha sido manipulado'
                    : '⚠️ No se pudo verificar el hash previo en la cadena'
                  }
                </div>
              </div>

              {/* Distribución demográfica si existe */}
              {record.groupBreakdown && Object.keys(record.groupBreakdown).length > 0 && (
                <div style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '11px', color: '#4A5568', fontWeight: 700, letterSpacing: '2px', marginBottom: '12px', fontFamily: 'Arial, sans-serif' }}>
                    DISTRIBUCIÓN POR GRUPO (DATOS ANONIMIZADOS)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                    {Object.entries(record.groupBreakdown).map(([group, count]) => (
                      <div key={group} style={{ padding: '10px', background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A365D', fontFamily: 'Arial, sans-serif' }}>{count}</div>
                        <div style={{ fontSize: '9px', color: '#718096', fontFamily: 'Arial, sans-serif' }}>{group}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pie del certificado */}
              <div style={{ borderTop: '2px solid #1A365D', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#718096', fontFamily: 'Arial, sans-serif' }}>FIRMADO ELECTRÓNICAMENTE POR SISTEMA AUTOMATIZADO</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1A365D', marginTop: '4px', fontFamily: 'Arial, sans-serif' }}>Volkern AI Compliance Engine</div>
                  <div style={{ fontSize: '10px', color: '#718096', fontFamily: 'Arial, sans-serif' }}>{systemVersion}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ width: '120px', height: '60px', border: '1px solid #E2E8F0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7FAFC' }}>
                    <div style={{ fontSize: '9px', color: '#A0AEC0', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>SELLO DIGITAL<br />VOLKERN ERP</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pie de página legal */}
            <div style={{ background: '#F7FAFC', padding: '16px 48px', borderTop: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: '9px', color: '#718096', lineHeight: '1.6', fontFamily: 'Arial, sans-serif' }}>
                Este documento ha sido generado automáticamente por el Sistema de Auditoría y Cumplimiento Ético de Volkern ERP.
                Los datos contenidos en este certificado son inmutables y están protegidos por un sello de integridad SHA-256 encadenado.
                Cualquier manipulación del registro en la base de datos invalidaría el hash de integridad, lo que sería detectable por el sistema.
                Documento válido como evidencia técnica ante autoridades regulatorias conforme a: {legalFramework}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

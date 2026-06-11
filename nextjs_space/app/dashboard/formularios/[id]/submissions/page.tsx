'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Loader2,
  User,
  Mail,
  Phone,
  Building2,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet } from '@/lib/api-client';

type LeadInfo = {
  id: string;
  nombre: string;
  email: string;
  telefono?: string;
  empresa?: string;
  estado: string;
};

type Submission = {
  id: string;
  formId: string;
  leadId?: string;
  payload: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lead?: LeadInfo;
};

type FormInfo = {
  id: string;
  name: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// ─── Expandable JSON Viewer ─────────────────────────────
function JSONViewer({ data }: { data: any }) {
  return (
    <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 overflow-x-auto max-h-64 overflow-y-auto font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ─── Main Page ──────────────────────────────────────────
export default function FormSubmissionsPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<FormInfo | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchSubmissions = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const res = await apiGet(`/api/formularios/${formId}/submissions?page=${page}&limit=${pagination.limit}`);
      setForm(res.form || null);
      setSubmissions(res.submissions || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (e) {
      toast.error('Error al cargar submissions');
    } finally {
      setLoading(false);
    }
  }, [formId, pagination.limit]);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  const handleExport = () => {
    setExporting(true);
    try {
      // Build CSV
      const headers = ['Fecha', 'Email', 'Nombre', 'Teléfono', 'Empresa', 'Lead ID', 'Datos (JSON)'];
      const rows = submissions.map((s) => [
        new Date(s.createdAt).toISOString(),
        s.payload?.email || s.payload?.Email || s.lead?.email || '',
        s.payload?.nombre || s.payload?.name || s.lead?.nombre || '',
        s.payload?.telefono || s.payload?.phone || s.lead?.telefono || '',
        s.payload?.empresa || s.payload?.company || s.lead?.empresa || '',
        s.leadId || '',
        JSON.stringify(s.payload).replace(/"/g, '""'),
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `submissions-${form?.name || formId}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado');
    } catch (e) {
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  if (loading && submissions.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard/formularios')}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {form?.name || 'Submissions'}
            </h1>
            <p className="text-slate-400 text-sm">
              {pagination.total} respuesta{pagination.total !== 1 ? 's' : ''} recibida{pagination.total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button
          onClick={handleExport}
          disabled={exporting || submissions.length === 0}
          variant="outline"
          className="gap-2 rounded-xl border-slate-700 text-slate-300"
          title={`Exportar ${submissions.length} resultados de esta página como CSV`}
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Exportar CSV ({submissions.length})
        </Button>
      </div>

      {/* Submissions Table */}
      {submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/30">
          <Mail className="w-12 h-12 text-slate-600 mb-4" />
          <p className="text-slate-400 text-lg">Sin respuestas aún</p>
          <p className="text-slate-500 text-sm mt-1">Embebe este formulario en una landing page para empezar a recibir datos</p>
        </div>
      ) : (
        <Card className="bg-slate-900 border-slate-800 overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-950/50 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <div className="col-span-2">Fecha</div>
            <div className="col-span-3">Contacto</div>
            <div className="col-span-2">Teléfono</div>
            <div className="col-span-2">Empresa</div>
            <div className="col-span-2">Lead</div>
            <div className="col-span-1"></div>
          </div>

          {/* Table Body */}
          {submissions.map((submission) => (
            <div key={submission.id}>
              <div
                className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-6 py-4 hover:bg-slate-800/30 transition-colors cursor-pointer items-center"
                onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
              >
                {/* Date */}
                <div className="md:col-span-2 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-slate-500 md:hidden" />
                  <span className="text-sm text-slate-300">
                    {new Date(submission.createdAt).toLocaleDateString('es-MX', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Contact */}
                <div className="md:col-span-3 flex items-center gap-2 min-w-0">
                  <Mail className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <span className="text-sm text-white truncate">
                    {submission.payload?.email || submission.payload?.Email || submission.lead?.email || '—'}
                  </span>
                </div>

                {/* Phone */}
                <div className="md:col-span-2 flex items-center gap-2">
                  <Phone className="w-3 h-3 text-slate-500 md:hidden flex-shrink-0" />
                  <span className="text-sm text-slate-400 truncate">
                    {submission.payload?.telefono || submission.payload?.phone || submission.lead?.telefono || '—'}
                  </span>
                </div>

                {/* Company */}
                <div className="md:col-span-2 flex items-center gap-2">
                  <Building2 className="w-3 h-3 text-slate-500 md:hidden flex-shrink-0" />
                  <span className="text-sm text-slate-400 truncate">
                    {submission.payload?.empresa || submission.payload?.company || submission.lead?.empresa || '—'}
                  </span>
                </div>

                {/* Lead status */}
                <div className="md:col-span-2">
                  {submission.lead ? (
                    <Badge
                      variant="outline"
                      className="text-xs border-green-700/50 text-green-400 bg-green-500/5"
                    >
                      {submission.lead.estado === 'nuevo' ? 'Nuevo' : submission.lead.estado}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-600">Sin lead</span>
                  )}
                </div>

                {/* Expand arrow */}
                <div className="md:col-span-1 flex justify-end">
                  <Eye className={`w-4 h-4 text-slate-500 transition-transform ${expandedId === submission.id ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedId === submission.id && (
                <div className="px-6 pb-4 bg-slate-950/30 border-t border-slate-800/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    {/* Left: Payload Data */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos del formulario</h4>
                      <JSONViewer data={submission.payload} />
                    </div>

                    {/* Right: Metadata & Actions */}
                    <div className="space-y-4">
                      {/* Lead info */}
                      {submission.lead && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead vinculado</h4>
                          <Card className="bg-slate-900 border-slate-800 p-3 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 text-blue-400" />
                              <span className="text-sm text-white font-medium">{submission.lead.nombre}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="w-3 h-3 text-slate-500" />
                              <span className="text-xs text-slate-400">{submission.lead.email}</span>
                            </div>
                            {submission.lead.telefono && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-3 h-3 text-slate-500" />
                                <span className="text-xs text-slate-400">{submission.lead.telefono}</span>
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-blue-400 hover:text-blue-300 text-xs mt-1 p-0 h-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/dashboard/leads/${submission.lead!.id}`);
                              }}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" /> Ver en CRM
                            </Button>
                          </Card>
                        </div>
                      )}

                      {/* Submission metadata */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Metadatos</h4>
                        <div className="space-y-1 text-xs text-slate-500">
                          <p>ID: <code className="text-slate-400 bg-slate-900 px-1 py-0.5 rounded">{submission.id}</code></p>
                          {submission.ipAddress && <p>IP: {submission.ipAddress}</p>}
                          {submission.userAgent && (
                            <p className="truncate">User Agent: {submission.userAgent.slice(0, 80)}...</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {submissions.indexOf(submission) < submissions.length - 1 && (
                <Separator className="bg-slate-800" />
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSubmissions(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="border-slate-700 text-slate-400 rounded-xl"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>
          <span className="text-sm text-slate-400">
            Página {pagination.page} de {pagination.totalPages} ({pagination.total} total)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSubmissions(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="border-slate-700 text-slate-400 rounded-xl"
          >
            Siguiente <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

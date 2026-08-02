'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Upload,
  LayoutGrid,
} from 'lucide-react';

interface PolizaTableProps {
  polizas: any[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSearch: (search: string) => void;
  onFilterChange: (filters: { estado?: string; ramo?: string }) => void;
  onNewPoliza: () => void;
  onImport: () => void;
  onRowClick: (id: string) => void;
  /** Callback para volver a vista cards. Sin él, el toggle table⇄cards no se muestra. */
  onSwitchToCards?: () => void;
}

const RAMOS = [
  'AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS',
  'EMPRESARIAL', 'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE',
  'AHORRO', 'JUBILACION', 'OTROS',
];

const ESTADOS = ['ACTIVA', 'PROXIMA_A_VENCER', 'VENCIDA', 'CANCELADA', 'EN_TRAMITE'];

const ESTADO_COLORS: Record<string, string> = {
  ACTIVA: 'bg-green-100 text-green-700',
  PROXIMA_A_VENCER: 'bg-amber-100 text-amber-700',
  VENCIDA: 'bg-red-100 text-red-700',
  CANCELADA: 'bg-gray-100 text-gray-500',
  EN_TRAMITE: 'bg-blue-100 text-blue-700',
};

export function PolizaTable({
  polizas,
  total,
  page,
  totalPages,
  onPageChange,
  onSearch,
  onFilterChange,
  onNewPoliza,
  onImport,
  onRowClick,
  onSwitchToCards,
}: PolizaTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [ramoFilter, setRamoFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    onSearch(value);
  };

  const handleEstadoFilter = (value: string) => {
    setEstadoFilter(value);
    onFilterChange({ estado: value === 'TODOS' ? undefined : value, ramo: ramoFilter || undefined });
  };

  const handleRamoFilter = (value: string) => {
    setRamoFilter(value);
    onFilterChange({ estado: estadoFilter || undefined, ramo: value === 'TODOS' ? undefined : value });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nº póliza, cliente, aseguradora..."
              value={searchTerm}
              onChange={e => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-muted' : ''}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          {onSwitchToCards && (
            <Button
              variant="outline"
              size="icon"
              onClick={onSwitchToCards}
              title="Cambiar a vista de tarjetas"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          )}
          <Button variant="outline" onClick={onImport}>
            <Upload className="w-4 h-4 mr-2" />
            Importar
          </Button>
          <Button onClick={onNewPoliza}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Póliza
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
          <div className="w-44">
            <Select value={estadoFilter || 'TODOS'} onValueChange={handleEstadoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los estados</SelectItem>
                {ESTADOS.map(e => (
                  <SelectItem key={e} value={e}>{e.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Select value={ramoFilter || 'TODOS'} onValueChange={handleRamoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Ramo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los ramos</SelectItem>
                {RAMOS.map(r => (
                  <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="p-3 font-medium">Nº Póliza</th>
                <th className="p-3 font-medium">Ramo</th>
                <th className="p-3 font-medium hidden md:table-cell">Cliente</th>
                <th className="p-3 font-medium hidden md:table-cell">Aseguradora</th>
                <th className="p-3 font-medium hidden lg:table-cell">Prima Anual</th>
                <th className="p-3 font-medium hidden lg:table-cell">Vencimiento</th>
                <th className="p-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {polizas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No se encontraron pólizas
                  </td>
                </tr>
              ) : (
                polizas.map((p: any) => (
                  <tr
                    key={p.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => onRowClick(p.id)}
                  >
                    <td className="p-3 font-medium text-sm">{p.numeroPoliza}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {p.productoSeguro?.ramo?.replace('_', ' ') || '—'}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm hidden md:table-cell">{p.cliente?.nombre || '—'}</td>
                    <td className="p-3 text-sm hidden md:table-cell">{p.aseguradora?.nombre || '—'}</td>
                    <td className="p-3 text-sm hidden lg:table-cell">
                      {p.primaAnual ? `${p.primaAnual.toLocaleString('es-ES')} ${p.moneda || 'EUR'}` : '—'}
                    </td>
                    <td className="p-3 text-sm hidden lg:table-cell">
                      {new Date(p.fechaVencimiento).toLocaleDateString('es-ES')}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-xs ${ESTADO_COLORS[p.estado] || ''}`}>
                        {p.estado?.replace('_', ' ') || '—'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} pólizas en total</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

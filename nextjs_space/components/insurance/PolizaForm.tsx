'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface PolizaFormData {
  clienteId: string;
  aseguradoraId: string;
  productoSeguroId: string;
  numeroPoliza: string;
  descripcion?: string;
  sumaAsegurada?: string;
  primaAnual?: string;
  formaPago?: string;
  moneda?: string;
  fechaInicio: string;
  fechaVencimiento: string;
  comisionPct?: string;
  notas?: string;
}

interface PolizaFormProps {
  initialData?: Partial<PolizaFormData>;
  onSubmit: (data: PolizaFormData) => void;
  onCancel: () => void;
  loading?: boolean;
}

const RAMOS = [
  'AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS',
  'EMPRESARIAL', 'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE',
  'AHORRO', 'JUBILACION', 'OTROS',
];

const FORMAS_PAGO = ['ANUAL', 'SEMESTRAL', 'TRIMESTRAL', 'MENSUAL'];

export function PolizaForm({ initialData, onSubmit, onCancel, loading }: PolizaFormProps) {
  const [clienteNombre, setClienteNombre] = useState('');
  const [aseguradoraNombre, setAseguradoraNombre] = useState('');
  const [productoNombre, setProductoNombre] = useState('');
  const [ramo, setRamo] = useState('OTROS');
  const [numeroPoliza, setNumeroPoliza] = useState('');
  const [primaAnual, setPrimaAnual] = useState('');
  const [sumaAsegurada, setSumaAsegurada] = useState('');
  const [formaPago, setFormaPago] = useState('ANUAL');
  const [moneda, setMoneda] = useState('EUR');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [notas, setNotas] = useState('');
  const [comisionPct, setComisionPct] = useState('');

  // Cargar datos iniciales
  useEffect(() => {
    if (initialData) {
      if (initialData.numeroPoliza) setNumeroPoliza(initialData.numeroPoliza);
      if (initialData.primaAnual) setPrimaAnual(initialData.primaAnual);
      if (initialData.sumaAsegurada) setSumaAsegurada(initialData.sumaAsegurada);
      if (initialData.formaPago) setFormaPago(initialData.formaPago);
      if (initialData.moneda) setMoneda(initialData.moneda);
      if (initialData.fechaInicio) setFechaInicio(initialData.fechaInicio);
      if (initialData.fechaVencimiento) setFechaVencimiento(initialData.fechaVencimiento);
      if (initialData.descripcion) setDescripcion(initialData.descripcion);
      if (initialData.notas) setNotas(initialData.notas);
      if (initialData.comisionPct) setComisionPct(initialData.comisionPct);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      clienteId: clienteNombre, // placeholder - se usará autocompletado
      aseguradoraId: aseguradoraNombre,
      productoSeguroId: productoNombre,
      numeroPoliza,
      descripcion,
      sumaAsegurada,
      primaAnual,
      formaPago,
      moneda,
      fechaInicio,
      fechaVencimiento,
      comisionPct,
      notas,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cliente */}
        <div className="space-y-2">
          <Label htmlFor="cliente">Cliente *</Label>
          <Input
            id="cliente"
            value={clienteNombre}
            onChange={e => setClienteNombre(e.target.value)}
            placeholder="Buscar cliente..."
            required
          />
        </div>

        {/* Aseguradora */}
        <div className="space-y-2">
          <Label htmlFor="aseguradora">Aseguradora *</Label>
          <Input
            id="aseguradora"
            value={aseguradoraNombre}
            onChange={e => setAseguradoraNombre(e.target.value)}
            placeholder="Buscar aseguradora..."
            required
          />
        </div>

        {/* Ramo */}
        <div className="space-y-2">
          <Label htmlFor="ramo">Ramo *</Label>
          <Select value={ramo} onValueChange={setRamo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RAMOS.map(r => (
                <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Producto */}
        <div className="space-y-2">
          <Label htmlFor="producto">Producto *</Label>
          <Input
            id="producto"
            value={productoNombre}
            onChange={e => setProductoNombre(e.target.value)}
            placeholder="Nombre del producto"
            required
          />
        </div>

        {/* Número de Póliza */}
        <div className="space-y-2">
          <Label htmlFor="numeroPoliza">Número de Póliza *</Label>
          <Input
            id="numeroPoliza"
            value={numeroPoliza}
            onChange={e => setNumeroPoliza(e.target.value)}
            placeholder="Ej: P-2026-00142"
            required
          />
        </div>

        {/* Prima Anual */}
        <div className="space-y-2">
          <Label htmlFor="primaAnual">Prima Anual</Label>
          <Input
            id="primaAnual"
            type="number"
            value={primaAnual}
            onChange={e => setPrimaAnual(e.target.value)}
            placeholder="0.00"
            step="0.01"
          />
        </div>

        {/* Suma Asegurada */}
        <div className="space-y-2">
          <Label htmlFor="sumaAsegurada">Suma Asegurada</Label>
          <Input
            id="sumaAsegurada"
            type="number"
            value={sumaAsegurada}
            onChange={e => setSumaAsegurada(e.target.value)}
            placeholder="0.00"
            step="0.01"
          />
        </div>

        {/* Forma de Pago */}
        <div className="space-y-2">
          <Label htmlFor="formaPago">Forma de Pago</Label>
          <Select value={formaPago} onValueChange={setFormaPago}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAS_PAGO.map(fp => (
                <SelectItem key={fp} value={fp}>{fp}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Moneda */}
        <div className="space-y-2">
          <Label htmlFor="moneda">Moneda</Label>
          <Select value={moneda} onValueChange={setMoneda}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR (€)</SelectItem>
              <SelectItem value="MXN">MXN ($)</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Fecha Inicio */}
        <div className="space-y-2">
          <Label htmlFor="fechaInicio">Fecha de Inicio *</Label>
          <Input
            id="fechaInicio"
            type="date"
            value={fechaInicio}
            onChange={e => setFechaInicio(e.target.value)}
            required
          />
        </div>

        {/* Fecha Vencimiento */}
        <div className="space-y-2">
          <Label htmlFor="fechaVencimiento">Fecha de Vencimiento *</Label>
          <Input
            id="fechaVencimiento"
            type="date"
            value={fechaVencimiento}
            onChange={e => setFechaVencimiento(e.target.value)}
            required
          />
        </div>

        {/* Comisión */}
        <div className="space-y-2">
          <Label htmlFor="comisionPct">Comisión (%)</Label>
          <Input
            id="comisionPct"
            type="number"
            value={comisionPct}
            onChange={e => setComisionPct(e.target.value)}
            placeholder="15"
            step="0.1"
          />
        </div>
      </div>

      {/* Descripción */}
      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Detalles adicionales de la póliza..."
          rows={3}
        />
      </div>

      {/* Notas */}
      <div className="space-y-2">
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea
          id="notas"
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Notas internas para el agente..."
          rows={2}
        />
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando...' : initialData ? 'Actualizar Póliza' : 'Crear Póliza'}
        </Button>
      </div>
    </form>
  );
}

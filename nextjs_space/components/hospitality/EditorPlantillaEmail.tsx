'use client';

/**
 * Editor visual de la plantilla de email de Hospitality (bloques).
 *
 * El hotel compone el correo como el que manda su canal: una cabecera con su
 * nombre y una etiqueta, un título, secciones de etiqueta/valor (detalles de la
 * reserva, alojamiento, huésped, pago), párrafos y botones. Cada bloque se
 * reordena, se edita y se borra; a la derecha se ve el correo tal y como lo
 * compila el mismo módulo que lo envía (`lib/hospitality/comunicaciones-email.ts`),
 * así que lo que se ve es lo que sale.
 *
 * Nada de este componente se guarda como HTML: guarda el diseño (JSON) y el
 * módulo puro lo compila. El texto se escapa siempre, y solo se reconocen
 * `**negrita**`, `*cursiva*` y `[texto](enlace)`.
 */

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  BLOQUE_EMAIL_TIPOS,
  LIMITES_DISENO,
  renderDisenoEmail,
  type BloqueEmail,
  type BloqueEmailTipo,
  type DisenoEmail,
} from '@/lib/hospitality/comunicaciones-email';

interface VariableDisponible {
  v: string;
  d: string;
}

interface Props {
  diseno: DisenoEmail | null;
  onChange: (diseno: DisenoEmail) => void;
  /** Contexto de ejemplo con el que se pinta la vista previa. */
  contexto: Record<string, string>;
  /** Variables insertables en el último campo que se tocó. */
  variables: VariableDisponible[];
}

const ETIQUETA_TIPO: Record<BloqueEmailTipo, string> = {
  texto: 'Párrafo',
  datos: 'Sección de datos',
  boton: 'Botón',
};

function bloqueNuevo(tipo: BloqueEmailTipo): BloqueEmail {
  if (tipo === 'datos') {
    return { tipo, titulo: '', filas: [{ etiqueta: '', valor: '' }] };
  }
  if (tipo === 'boton') {
    return { tipo, botonTexto: '', botonEnlace: '' };
  }
  return { tipo, texto: '' };
}

interface PropsBloque {
  bloque: BloqueEmail;
  indice: number;
  total: number;
  onCambio: (parcial: Partial<BloqueEmail>) => void;
  onFila: (fila: number, parcial: Partial<{ etiqueta: string; valor: string }>) => void;
  onMover: (delta: number) => void;
  onQuitar: () => void;
  onFoco: (clave: string) => void;
}

/** Un bloque del correo con sus controles. */
function BloqueEditor({ bloque, indice, total, onCambio, onFila, onMover, onQuitar, onFoco }: PropsBloque) {
  const filas = bloque.filas || [];
  const claveBase = `b${indice}`;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{indice + 1}</Badge>
          <span className="text-xs font-medium">{ETIQUETA_TIPO[bloque.tipo]}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Subir" disabled={indice === 0} onClick={() => onMover(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Bajar" disabled={indice === total - 1} onClick={() => onMover(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Quitar bloque" onClick={onQuitar}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {bloque.tipo === 'datos' && (
        <div className="space-y-1">
          <Label className="text-xs">Título de la sección</Label>
          <Input
            value={bloque.titulo || ''}
            maxLength={LIMITES_DISENO.titulo}
            placeholder="Detalles de la reserva"
            onFocus={() => onFoco(`${claveBase}.titulo`)}
            onChange={(e) => onCambio({ titulo: e.target.value })}
          />
        </div>
      )}

      {bloque.tipo === 'texto' && (
        <div className="space-y-1">
          <Label className="text-xs">Texto</Label>
          <Textarea
            rows={3}
            value={bloque.texto || ''}
            maxLength={LIMITES_DISENO.texto}
            placeholder="Hola {{nombre}}, tu reserva está confirmada. Usa **negrita** o [un enlace](https://…)."
            onFocus={() => onFoco(`${claveBase}.texto`)}
            onChange={(e) => onCambio({ texto: e.target.value })}
          />
        </div>
      )}

      {bloque.tipo === 'boton' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Texto del botón</Label>
            <Input
              value={bloque.botonTexto || ''}
              maxLength={LIMITES_DISENO.boton}
              placeholder="Completar el registro"
              onFocus={() => onFoco(`${claveBase}.botonTexto`)}
              onChange={(e) => onCambio({ botonTexto: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Enlace</Label>
            <Input
              value={bloque.botonEnlace || ''}
              maxLength={LIMITES_DISENO.valor}
              placeholder="https://… o {{enlace_checkin}}"
              onFocus={() => onFoco(`${claveBase}.botonEnlace`)}
              onChange={(e) => onCambio({ botonEnlace: e.target.value })}
            />
          </div>
        </div>
      )}

      {bloque.tipo === 'datos' && (
        <div className="space-y-2">
          {filas.map((fila, j) => (
            <div key={j} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-start">
              <Input
                value={fila.etiqueta}
                maxLength={LIMITES_DISENO.etiqueta}
                placeholder="Etiqueta"
                onFocus={() => onFoco(`${claveBase}.e${j}`)}
                onChange={(e) => onFila(j, { etiqueta: e.target.value })}
              />
              <Input
                value={fila.valor}
                maxLength={LIMITES_DISENO.valor}
                placeholder="{{checkIn}}"
                onFocus={() => onFoco(`${claveBase}.v${j}`)}
                onChange={(e) => onFila(j, { valor: e.target.value })}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                title={filas.length > 1 ? 'Quitar fila' : 'Vaciar la fila'}
                onClick={() => (filas.length > 1 ? onCambio({ filas: filas.filter((_, k) => k !== j) }) : onFila(j, { etiqueta: '', valor: '' }))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {filas.length < LIMITES_DISENO.filas && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onCambio({ filas: [...filas, { etiqueta: '', valor: '' }] })}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Añadir fila
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function EditorPlantillaEmail({ diseno, onChange, contexto, variables }: Props) {
  const base: DisenoEmail = diseno ?? { version: 1, bloques: [] };
  const [foco, setFoco] = useState<string>('titulo');
  const [verVariables, setVerVariables] = useState(false);

  const set = (parcial: Partial<DisenoEmail>) => onChange({ ...base, ...parcial });
  const setBloque = (i: number, parcial: Partial<BloqueEmail>) =>
    set({ bloques: base.bloques.map((b, j) => (j === i ? { ...b, ...parcial } : b)) });
  const setFila = (i: number, fila: number, parcial: Partial<{ etiqueta: string; valor: string }>) =>
    setBloque(i, {
      filas: (base.bloques[i]?.filas || []).map((f, j) => (j === fila ? { ...f, ...parcial } : f)),
    });
  const mover = (i: number, delta: number) => {
    const destino = i + delta;
    if (destino < 0 || destino >= base.bloques.length) return;
    const copia = [...base.bloques];
    [copia[i], copia[destino]] = [copia[destino], copia[i]];
    set({ bloques: copia });
  };

  /** Inserta una variable en el último campo que se tocó. */
  const insertar = (variable: string) => {
    if (foco === 'titulo') return set({ titulo: `${base.titulo || ''}${variable}` });
    if (foco === 'pie') return set({ pie: `${base.pie || ''}${variable}` });
    const partes = /^b(\d+)\.(.+)$/.exec(foco);
    if (!partes) return;
    const i = Number(partes[1]);
    const campo = partes[2];
    const bloque = base.bloques[i];
    if (!bloque) return;
    if (campo === 'texto') return setBloque(i, { texto: `${bloque.texto || ''}${variable}` });
    if (campo === 'titulo') return setBloque(i, { titulo: `${bloque.titulo || ''}${variable}` });
    if (campo === 'botonTexto') return setBloque(i, { botonTexto: `${bloque.botonTexto || ''}${variable}` });
    if (campo === 'botonEnlace') return setBloque(i, { botonEnlace: `${bloque.botonEnlace || ''}${variable}` });
    const valor = /^v(\d+)$/.exec(campo);
    const etiqueta = /^e(\d+)$/.exec(campo);
    if (valor) setFila(i, Number(valor[1]), { valor: `${bloque.filas?.[Number(valor[1])]?.valor || ''}${variable}` });
    else if (etiqueta) setFila(i, Number(etiqueta[1]), { etiqueta: `${bloque.filas?.[Number(etiqueta[1])]?.etiqueta || ''}${variable}` });
  };

  const html = base.bloques.length > 0 ? renderDisenoEmail(base, contexto).html : '';

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Las variables se insertan en el último campo que toques: {foco}.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setVerVariables((v) => !v)}>
            {verVariables ? 'Ocultar variables' : 'Variables'}
          </Button>
        </div>
        {verVariables && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {variables.map((x) => (
              <button
                key={x.v}
                type="button"
                title={x.d}
                className="rounded bg-muted px-2 py-1 text-xs font-mono hover:bg-muted-foreground/20"
                onClick={() => insertar(x.v)}
              >
                {x.v}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-medium">Cabecera</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={base.cabecera?.nombre || ''}
                maxLength={LIMITES_DISENO.cabecera}
                placeholder="Nombre del hotel"
                onChange={(e) => set({ cabecera: { ...base.cabecera, nombre: e.target.value } })}
              />
              <Input
                value={base.cabecera?.etiqueta || ''}
                maxLength={LIMITES_DISENO.cabecera}
                placeholder="Reserva confirmada"
                onChange={(e) => set({ cabecera: { ...base.cabecera, etiqueta: e.target.value } })}
              />
            </div>
            <Input
              value={base.cabecera?.logotipo || ''}
              placeholder="https://…/logotipo.png"
              onChange={(e) => set({ cabecera: { ...base.cabecera, logotipo: e.target.value } })}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Título del correo</Label>
            <Input
              value={base.titulo || ''}
              maxLength={LIMITES_DISENO.titulo}
              placeholder="{{propiedad}}"
              onFocus={() => setFoco('titulo')}
              onChange={(e) => set({ titulo: e.target.value })}
            />
          </div>

          {base.bloques.map((bloque, i) => (
            <BloqueEditor
              key={i}
              bloque={bloque}
              indice={i}
              total={base.bloques.length}
              onCambio={(p) => setBloque(i, p)}
              onFila={(fila, p) => setFila(i, fila, p)}
              onMover={(delta) => mover(i, delta)}
              onQuitar={() => set({ bloques: base.bloques.filter((_, j) => j !== i) })}
              onFoco={setFoco}
            />
          ))}

          <div className="flex flex-wrap gap-2">
            {BLOQUE_EMAIL_TIPOS.map((tipo) => (
              <Button
                key={tipo}
                type="button"
                size="sm"
                variant="outline"
                disabled={base.bloques.length >= LIMITES_DISENO.bloques}
                onClick={() => set({ bloques: [...base.bloques, bloqueNuevo(tipo)] })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> {ETIQUETA_TIPO[tipo]}
              </Button>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Pie del correo</Label>
            <Textarea
              rows={2}
              value={base.pie || ''}
              maxLength={LIMITES_DISENO.pie}
              onFocus={() => setFoco('pie')}
              onChange={(e) => set({ pie: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Vista previa (así lo compila el envío)</Label>
          {html ? (
            <iframe
              title="Vista previa del correo"
              sandbox=""
              srcDoc={html}
              className="h-[540px] w-full rounded-md border bg-white"
            />
          ) : (
            <div className="flex h-[540px] items-center justify-center rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Añade al menos un bloque con contenido para ver el correo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

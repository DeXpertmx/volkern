/**
 * Volkern Real Estate — OwnerCard Component
 *
 * Ficha del propietario/vendedor de una propiedad inmobiliaria.
 * Muestra datos de contacto con diseño tipo profile card.
 */

'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  User,
  Phone,
  Mail,
  ExternalLink,
  Copy,
  CheckCheck,
  MapPin,
  Building2,
  ShieldCheck,
  UserCircle2,
  AlertCircle,
  Link2,
  PhoneCall,
  Send,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OwnerData {
  name: string | null;
  phone: string | null;
  email: string | null;
  contactId: string | null;
}

interface OwnerCardProps {
  owner: OwnerData;
  propertyName?: string;
  /** Si es true, muestra bordes y sombras más sutiles para integrarse en paneles */
  compact?: boolean;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function getGradientFromName(name: string | null): string {
  if (!name) return 'from-gray-400 to-gray-500';
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `from-[hsl(${hue},60%,50%)] to-[hsl(${(hue + 60) % 360},55%,45%)]`;
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  } catch {
    toast.error('No se pudo copiar al portapapeles');
  }
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  // Si ya tiene formato internacional con +, devolver tal cual
  if (phone.startsWith('+')) return phone;
  // Si es español y empieza por 6/7/9, añadir +34
  if (phone.match(/^[679]\d{8}$/)) return `+34 ${phone}`;
  return phone;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OwnerCard({ owner, propertyName, compact = false, className }: OwnerCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const hasData = owner.name || owner.phone || owner.email || owner.contactId;

  const handleCopy = async (text: string, field: string) => {
    await copyToClipboard(text, field);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Empty State ──
  if (!hasData) {
    return (
      <Card className={cn('overflow-hidden', compact ? 'shadow-sm' : '', className)}>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center text-center py-6">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <UserCircle2 className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground mb-1">
              Sin propietario
            </h3>
            <p className="text-sm text-muted-foreground/70 max-w-[220px]">
              {propertyName
                ? `No se han registrado datos del propietario para "${propertyName}"`
                : 'No hay datos del propietario registrados'}
            </p>
            <Badge variant="outline" className="mt-4 text-amber-600 border-amber-200 bg-amber-50 gap-1">
              <AlertCircle className="h-3 w-3" />
              Datos pendientes
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const initials = getInitials(owner.name);
  const gradientClass = getGradientFromName(owner.name);
  const formattedPhone = formatPhone(owner.phone);

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-200 hover:shadow-md group',
        compact ? 'shadow-sm' : '',
        className
      )}
    >
      {/* Gradient header strip */}
      <div className={cn('h-2 bg-gradient-to-r', gradientClass)} />

      <CardHeader className={cn('pb-4', compact ? 'p-4 pb-2' : '')}>
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className={cn('h-16 w-16 ring-2 ring-background shadow-lg -mt-8', compact ? 'h-12 w-12 -mt-6' : '')}>
            <AvatarFallback
              className={cn(
                'text-lg font-bold text-white bg-gradient-to-br',
                gradientClass
              )}
            >
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className={cn('text-lg', compact ? 'text-base' : '')}>
                {owner.name || 'Propietario'}
              </CardTitle>
              {owner.contactId && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-blue-200 text-blue-600 bg-blue-50 gap-1"
                >
                  <ShieldCheck className="h-3 w-3" />
                  CRM
                </Badge>
              )}
            </div>
            <CardDescription className="flex items-center gap-1 mt-0.5">
              <User className="h-3 w-3" />
              Propietario / Vendedor
              {propertyName && (
                <>
                  <span className="mx-1 text-muted-foreground/40">·</span>
                  <span className="truncate max-w-[180px]">{propertyName}</span>
                </>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className={cn('space-y-4', compact ? 'p-4 pt-0' : '')}>
        <Separator />

        {/* Contact Info */}
        <div className="space-y-3">
          {/* Name (copy) */}
          {owner.name && (
            <div className="flex items-center justify-between group/field rounded-lg p-2 -mx-2 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Nombre completo</p>
                  <p className="text-sm font-medium truncate">{owner.name}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0"
                onClick={() => handleCopy(owner.name!, 'Nombre')}
                title="Copiar nombre"
              >
                {copiedField === 'Nombre' ? (
                  <CheckCheck className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {/* Phone */}
          {owner.phone && (
            <div className="flex items-center justify-between group/field rounded-lg p-2 -mx-2 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                  <Phone className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Teléfono</p>
                  <p className="text-sm font-medium tabular-nums">{formattedPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleCopy(owner.phone!, 'Teléfono')}
                  title="Copiar teléfono"
                >
                  {copiedField === 'Teléfono' ? (
                    <CheckCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-emerald-600"
                  onClick={() => window.open(`tel:${owner.phone}`, '_blank')}
                  title="Llamar"
                >
                  <PhoneCall className="h-4 w-4" />
                </Button>
                {owner.phone.match(/^(?:\+?\d{7,15})$/) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-emerald-600"
                    onClick={() => window.open(`https://wa.me/${owner.phone!.replace(/[^0-9]/g, '')}`, '_blank')}
                    title="WhatsApp"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Email */}
          {owner.email && (
            <div className="flex items-center justify-between group/field rounded-lg p-2 -mx-2 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium truncate">{owner.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleCopy(owner.email!, 'Email')}
                  title="Copiar email"
                >
                  {copiedField === 'Email' ? (
                    <CheckCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-600"
                  onClick={() => window.open(`mailto:${owner.email}`, '_blank')}
                  title="Enviar email"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Contact ID (link to CRM) */}
          {owner.contactId && (
            <div className="flex items-center justify-between rounded-lg p-2 -mx-2 bg-indigo-50/50 border border-indigo-100/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                  <Link2 className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Contacto vinculado en CRM</p>
                  <p className="text-xs font-mono text-indigo-600 truncate max-w-[200px]">
                    ID: {owner.contactId}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-100 shrink-0"
                onClick={() => window.open(`/dashboard/contacts?id=${owner.contactId}`, '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Ver
              </Button>
            </div>
          )}
        </div>

        {/* Quick actions footer */}
        <div className="flex gap-2 pt-2">
          {owner.phone && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 text-xs"
              onClick={() => handleCopy(formatPhone(owner.phone), 'Teléfono')}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copiar teléfono
            </Button>
          )}
          {owner.email && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 text-xs"
              onClick={() => window.open(`mailto:${owner.email}`, '_blank')}
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Enviar email
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Versión compacta para integrar en tablas o listas.
 * Es un alias que renderiza el OwnerCard con compact=true.
 */
export function OwnerBadge({ owner, propertyName }: { owner: OwnerData; propertyName?: string }) {
  if (!owner.name && !owner.phone && !owner.email) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground gap-1 border-dashed">
        <UserCircle2 className="h-3 w-3" />
        Sin propietario
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-7 w-7">
        <AvatarFallback className="text-[10px] font-bold text-white bg-gradient-to-br from-primary to-primary/70">
          {getInitials(owner.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate max-w-[130px] leading-tight">
          {owner.name || 'Propietario'}
        </p>
        {owner.phone && (
          <p className="text-[10px] text-muted-foreground tabular-nums truncate max-w-[130px]">
            {formatPhone(owner.phone)}
          </p>
        )}
      </div>
    </div>
  );
}

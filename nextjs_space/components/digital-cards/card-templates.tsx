
'use client';

import Image from 'next/image';
import { Phone, Mail, Globe, MapPin, Linkedin, Twitter, Facebook, Instagram, MessageCircle, Send, Smartphone } from 'lucide-react';

export interface DigitalCardData {
  nombre: string;
  puesto?: string;
  empresa?: string;
  telefonoMovil?: string;
  telefonoOficina?: string;
  email?: string;
  sitioWeb?: string;
  whatsapp?: string;
  telegram?: string;
  redesSociales?: Record<string, string>;
  template: string;
  fontFamily: string;
  layoutStyle: string;
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  colorTexto: string;
  backgroundPattern: string;
  logoUrl?: string;
  fotoPerfilUrl?: string;
  bannerUrl?: string;
}

interface CardTemplateProps {
  data: DigitalCardData;
  isPreview?: boolean;
}

// Helper para aplicar patrones de fondo
const getBackgroundStyle = (pattern: string, colorPrimario: string) => {
  switch (pattern) {
    case 'dots':
      return {
        backgroundImage: `radial-gradient(circle, ${colorPrimario}20 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
      };
    case 'waves':
      return {
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='https://lh4.googleusercontent.com/QqVeSJmBX6S0iTaJGpNhet5Nb9oqNGDNq1QiH31SE1v6KmaO4JOHIXShv4MqvSew7WvsmfoQj7y6Y6Zf-kZxm3oMC2rUFI4vLMVeLmNoDQTMG0NC2AkEraZcVV9ZeA-ez0A1fg-X d='M0 10 Q 25 0, 50 10 T 100 10' stroke='${colorPrimario.replace('#', '%23')}' fill='none' opacity='0.1'/%3E%3C/svg%3E")`,
        backgroundSize: '100px 20px',
      };
    case 'gradient':
      return {
        background: `linear-gradient(135deg, ${colorPrimario}10 0%, transparent 100%)`,
      };
    case 'geometric':
      return {
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='https://thumbs.dreamstime.com/b/trianglerepeatepatterntemplate-137781797.jpg fill='none' fill-rule='evenodd'%3E%3Cg fill='${colorPrimario.replace('#', '%23')}' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      };
    default:
      return {};
  }
};

// Plantilla Classic (similar a HiHello Classic)
export function ClassicTemplate({ data, isPreview = false }: CardTemplateProps) {
  const fontStyle = { fontFamily: data.fontFamily };
  const bgPattern = getBackgroundStyle(data.backgroundPattern, data.colorPrimario);

  return (
    <div className="w-full max-w-2xl mx-auto" style={fontStyle}>
      <div
        className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: data.colorFondo, ...bgPattern }}
      >
        {/* Header con gradiente y curva */}
        <div className="relative h-40" style={{
          background: `linear-gradient(135deg, ${data.colorPrimario} 0%, ${data.colorSecundario} 100%)`,
        }}>
          {/* Curva inferior */}
          <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 120" xmlns="http://www.w3.org/2000/svg">
            <path fill={data.colorFondo} d="M0,64L120,69.3C240,75,480,85,720,80C960,75,1200,53,1320,42.7L1440,32L1440,120L1320,120C1200,120,960,120,720,120C480,120,240,120,120,120L0,120Z"></path>
          </svg>

          {/* Logo empresa */}
          {data.logoUrl && (
            <div className="absolute top-4 right-4 bg-white p-2 rounded-lg shadow-md">
              <Image src={data.logoUrl} alt="Logo" width={60} height={60} className="object-contain" />
            </div>
          )}
        </div>

        {/* Foto de perfil */}
        <div className="relative -mt-16 flex justify-center px-6">
          <div className="relative">
            {data.fotoPerfilUrl ? (
              <Image
                src={data.fotoPerfilUrl}
                alt={data.nombre}
                width={120}
                height={120}
                className="rounded-full border-4 shadow-xl object-cover"
                style={{ borderColor: data.colorFondo }}
              />
            ) : (
              <div
                className="w-32 h-32 rounded-full border-4 shadow-xl flex items-center justify-center text-4xl font-bold"
                style={{
                  borderColor: data.colorFondo,
                  backgroundColor: data.colorPrimario,
                  color: 'white'
                }}
              >
                {data.nombre.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Información */}
        <div className="px-8 py-6 text-center">
          <h1 className="text-3xl font-bold mb-2" style={{ color: data.colorTexto }}>
            {data.nombre}
          </h1>
          {data.puesto && (
            <p className="text-lg mb-1" style={{ color: data.colorPrimario }}>
              {data.puesto}
            </p>
          )}
          {data.empresa && (
            <p className="text-md opacity-70" style={{ color: data.colorTexto }}>
              {data.empresa}
            </p>
          )}
        </div>

        {/* Botones de contacto */}
        <div className="px-8 pb-8 space-y-3">
          {data.email && (
            <a
              href={`mailto:${data.email}`}
              className="flex items-center gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundColor: `${data.colorPrimario}10` }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: data.colorPrimario }}>
                <Mail className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium" style={{ color: data.colorTexto }}>{data.email}</span>
            </a>
          )}

          {data.whatsapp && (
            <a
              href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`}
              className="flex items-center gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundColor: `${data.colorPrimario}10` }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#25D366' }}>
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium" style={{ color: data.colorTexto }}>{data.whatsapp}</span>
            </a>
          )}

          {data.telefonoMovil && (
            <a
              href={`tel:${data.telefonoMovil}`}
              className="flex items-center gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundColor: `${data.colorPrimario}10` }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: data.colorPrimario }}>
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium" style={{ color: data.colorTexto }}>{data.telefonoMovil}</span>
            </a>
          )}

          {data.sitioWeb && (
            <a
              href={data.sitioWeb}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundColor: `${data.colorPrimario}10` }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: data.colorPrimario }}>
                <Globe className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium" style={{ color: data.colorTexto }}>{data.sitioWeb}</span>
            </a>
          )}
        </div>

        {/* Redes sociales */}
        {data.redesSociales && Object.keys(data.redesSociales).length > 0 && (
          <div className="px-8 pb-8">
            <div className="flex justify-center gap-4">
              {data.redesSociales.linkedin && (
                <a
                  href={data.redesSociales.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: '#0077B5' }}
                >
                  <Linkedin className="w-6 h-6 text-white" />
                </a>
              )}
              {data.redesSociales.twitter && (
                <a
                  href={data.redesSociales.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: '#1DA1F2' }}
                >
                  <Twitter className="w-6 h-6 text-white" />
                </a>
              )}
              {data.redesSociales.facebook && (
                <a
                  href={data.redesSociales.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  <Facebook className="w-6 h-6 text-white" />
                </a>
              )}
              {data.redesSociales.instagram && (
                <a
                  href={data.redesSociales.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{ background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)' }}
                >
                  <Instagram className="w-6 h-6 text-white" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Plantilla Modern (diseño minimalista y plano)
export function ModernTemplate({ data, isPreview = false }: CardTemplateProps) {
  const fontStyle = { fontFamily: data.fontFamily };
  const bgPattern = getBackgroundStyle(data.backgroundPattern, data.colorPrimario);

  return (
    <div className="w-full max-w-2xl mx-auto" style={fontStyle}>
      <div
        className="rounded-3xl shadow-xl overflow-hidden border"
        style={{ backgroundColor: data.colorFondo, borderColor: `${data.colorPrimario}30`, ...bgPattern }}
      >
        {/* Banner superior (opcional) */}
        {data.bannerUrl ? (
          <div className="relative h-48">
            <Image src={data.bannerUrl} alt="Banner" fill className="object-cover" />
          </div>
        ) : (
          <div className="h-24" style={{ backgroundColor: `${data.colorPrimario}15` }} />
        )}

        {/* Contenido principal */}
        <div className="px-8 py-8">
          {/* Foto y logo en línea */}
          <div className="flex items-center gap-6 mb-6">
            {data.fotoPerfilUrl ? (
              <Image
                src={data.fotoPerfilUrl}
                alt={data.nombre}
                width={100}
                height={100}
                className="rounded-2xl shadow-lg object-cover"
              />
            ) : (
              <div
                className="w-24 h-24 rounded-2xl shadow-lg flex items-center justify-center text-3xl font-bold"
                style={{ backgroundColor: data.colorPrimario, color: 'white' }}
              >
                {data.nombre.charAt(0).toUpperCase()}
              </div>
            )}

            {data.logoUrl && (
              <div className="ml-auto">
                <Image src={data.logoUrl} alt="Logo" width={80} height={80} className="object-contain" />
              </div>
            )}
          </div>

          {/* Información */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2" style={{ color: data.colorTexto }}>
              {data.nombre}
            </h1>
            {data.puesto && (
              <p className="text-xl font-medium mb-1" style={{ color: data.colorPrimario }}>
                {data.puesto}
              </p>
            )}
            {data.empresa && (
              <p className="text-lg opacity-70" style={{ color: data.colorTexto }}>
                {data.empresa}
              </p>
            )}
          </div>

          {/* Grid de contacto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {data.email && (
              <a
                href={`mailto:${data.email}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:scale-105 transition-transform"
                style={{ backgroundColor: `${data.colorPrimario}10` }}
              >
                <Mail className="w-5 h-5" style={{ color: data.colorPrimario }} />
                <span className="text-sm font-medium truncate" style={{ color: data.colorTexto }}>{data.email}</span>
              </a>
            )}

            {data.whatsapp && (
              <a
                href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:scale-105 transition-transform"
                style={{ backgroundColor: '#25D36610' }}
              >
                <MessageCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium truncate" style={{ color: data.colorTexto }}>{data.whatsapp}</span>
              </a>
            )}

            {data.telefonoMovil && (
              <a
                href={`tel:${data.telefonoMovil}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:scale-105 transition-transform"
                style={{ backgroundColor: `${data.colorPrimario}10` }}
              >
                <Smartphone className="w-5 h-5" style={{ color: data.colorPrimario }} />
                <span className="text-sm font-medium" style={{ color: data.colorTexto }}>{data.telefonoMovil}</span>
              </a>
            )}

            {data.sitioWeb && (
              <a
                href={data.sitioWeb}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg hover:scale-105 transition-transform"
                style={{ backgroundColor: `${data.colorPrimario}10` }}
              >
                <Globe className="w-5 h-5" style={{ color: data.colorPrimario }} />
                <span className="text-sm font-medium truncate" style={{ color: data.colorTexto }}>{data.sitioWeb}</span>
              </a>
            )}
          </div>

          {/* Redes sociales en línea */}
          {data.redesSociales && Object.keys(data.redesSociales).length > 0 && (
            <div className="flex gap-3 pt-6 border-t" style={{ borderColor: `${data.colorPrimario}20` }}>
              {data.redesSociales.linkedin && (
                <a
                  href={data.redesSociales.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                  style={{ backgroundColor: '#0077B5' }}
                >
                  <Linkedin className="w-5 h-5 text-white" />
                </a>
              )}
              {data.redesSociales.twitter && (
                <a
                  href={data.redesSociales.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                  style={{ backgroundColor: '#1DA1F2' }}
                >
                  <Twitter className="w-5 h-5 text-white" />
                </a>
              )}
              {data.redesSociales.facebook && (
                <a
                  href={data.redesSociales.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  <Facebook className="w-5 h-5 text-white" />
                </a>
              )}
              {data.redesSociales.instagram && (
                <a
                  href={data.redesSociales.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                  style={{ background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)' }}
                >
                  <Instagram className="w-5 h-5 text-white" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Plantilla Elegant (diseño sofisticado con bordes dorados)
export function ElegantTemplate({ data, isPreview = false }: CardTemplateProps) {
  const fontStyle = { fontFamily: data.fontFamily };
  const bgPattern = getBackgroundStyle(data.backgroundPattern, data.colorPrimario);

  return (
    <div className="w-full max-w-2xl mx-auto" style={fontStyle}>
      <div
        className="rounded-xl shadow-2xl overflow-hidden relative border-4"
        style={{
          backgroundColor: data.colorFondo,
          borderColor: '#D4AF37',
          ...bgPattern
        }}
      >
        {/* Decoración superior */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/5 to-transparent pointer-events-none" />

        {/* Contenido principal */}
        <div className="relative px-8 py-12 text-center">
          {/* Logo empresa (esquina) */}
          {data.logoUrl && (
            <div className="absolute top-4 left-4 bg-white/80 p-3 rounded-lg shadow-md backdrop-blur-sm">
              <Image src={data.logoUrl} alt="Logo" width={50} height={50} className="object-contain" />
            </div>
          )}

          {/* Foto de perfil con borde dorado */}
          <div className="flex justify-center mb-6">
            {data.fotoPerfilUrl ? (
              <div className="relative">
                <Image
                  src={data.fotoPerfilUrl}
                  alt={data.nombre}
                  width={140}
                  height={140}
                  className="rounded-full shadow-2xl object-cover border-4"
                  style={{ borderColor: '#D4AF37' }}
                />
                <div
                  className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: data.colorPrimario }}
                >
                  <span className="text-white text-xl font-bold">
                    {data.nombre.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="w-36 h-36 rounded-full shadow-2xl flex items-center justify-center text-5xl font-bold border-4"
                style={{
                  backgroundColor: data.colorPrimario,
                  color: 'white',
                  borderColor: '#D4AF37'
                }}
              >
                {data.nombre.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Información */}
          <div className="mb-8">
            <h1
              className="text-4xl font-serif font-bold mb-3"
              style={{ color: data.colorTexto }}
            >
              {data.nombre}
            </h1>
            {data.puesto && (
              <p
                className="text-xl font-medium mb-2"
                style={{ color: data.colorPrimario }}
              >
                {data.puesto}
              </p>
            )}
            {data.empresa && (
              <p className="text-lg italic opacity-80" style={{ color: data.colorTexto }}>
                {data.empresa}
              </p>
            )}
          </div>

          {/* Línea decorativa */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="h-px w-20 bg-gradient-to-r from-transparent to-amber-400" />
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <div className="h-px w-20 bg-gradient-to-l from-transparent to-amber-400" />
          </div>

          {/* Información de contacto elegante */}
          <div className="space-y-4 mb-8">
            {data.email && (
              <a
                href={`mailto:${data.email}`}
                className="flex items-center justify-center gap-3 p-4 rounded-xl transition-all hover:scale-105"
                style={{ backgroundColor: `${data.colorPrimario}08`, border: `1px solid ${data.colorPrimario}30` }}
              >
                <Mail className="w-5 h-5" style={{ color: data.colorPrimario }} />
                <span className="font-medium" style={{ color: data.colorTexto }}>{data.email}</span>
              </a>
            )}

            {data.whatsapp && (
              <a
                href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`}
                className="flex items-center justify-center gap-3 p-4 rounded-xl transition-all hover:scale-105"
                style={{ backgroundColor: '#25D36608', border: '1px solid #25D36630' }}
              >
                <MessageCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium" style={{ color: data.colorTexto }}>{data.whatsapp}</span>
              </a>
            )}

            {data.telefonoMovil && (
              <a
                href={`tel:${data.telefonoMovil}`}
                className="flex items-center justify-center gap-3 p-4 rounded-xl transition-all hover:scale-105"
                style={{ backgroundColor: `${data.colorPrimario}08`, border: `1px solid ${data.colorPrimario}30` }}
              >
                <Smartphone className="w-5 h-5" style={{ color: data.colorPrimario }} />
                <span className="font-medium" style={{ color: data.colorTexto }}>{data.telefonoMovil}</span>
              </a>
            )}

            {data.sitioWeb && (
              <a
                href={data.sitioWeb}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 p-4 rounded-xl transition-all hover:scale-105"
                style={{ backgroundColor: `${data.colorPrimario}08`, border: `1px solid ${data.colorPrimario}30` }}
              >
                <Globe className="w-5 h-5" style={{ color: data.colorPrimario }} />
                <span className="font-medium" style={{ color: data.colorTexto }}>{data.sitioWeb}</span>
              </a>
            )}
          </div>

          {/* Redes sociales con efecto dorado */}
          {data.redesSociales && Object.keys(data.redesSociales).length > 0 && (
            <div className="flex justify-center gap-4 pt-6 border-t border-amber-200">
              {data.redesSociales.linkedin && (
                <a
                  href={data.redesSociales.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-md"
                  style={{ backgroundColor: '#0077B5' }}
                >
                  <Linkedin className="w-6 h-6 text-white" />
                </a>
              )}
              {data.redesSociales.twitter && (
                <a
                  href={data.redesSociales.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-md"
                  style={{ backgroundColor: '#1DA1F2' }}
                >
                  <Twitter className="w-6 h-6 text-white" />
                </a>
              )}
              {data.redesSociales.facebook && (
                <a
                  href={data.redesSociales.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-md"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  <Facebook className="w-6 h-6 text-white" />
                </a>
              )}
              {data.redesSociales.instagram && (
                <a
                  href={data.redesSociales.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-md"
                  style={{ background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)' }}
                >
                  <Instagram className="w-6 h-6 text-white" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Plantilla Minimal (ultra-minimalista)
export function MinimalTemplate({ data, isPreview = false }: CardTemplateProps) {
  const fontStyle = { fontFamily: data.fontFamily };
  const bgPattern = getBackgroundStyle(data.backgroundPattern, data.colorPrimario);

  return (
    <div className="w-full max-w-2xl mx-auto" style={fontStyle}>
      <div
        className="rounded-2xl shadow-lg overflow-hidden border"
        style={{
          backgroundColor: data.colorFondo,
          borderColor: `${data.colorPrimario}20`,
          ...bgPattern
        }}
      >
        <div className="px-12 py-16">
          {/* Logo y foto en línea horizontal */}
          <div className="flex items-center justify-between mb-12">
            {data.fotoPerfilUrl ? (
              <Image
                src={data.fotoPerfilUrl}
                alt={data.nombre}
                width={80}
                height={80}
                className="rounded-2xl shadow-md object-cover"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-2xl shadow-md flex items-center justify-center text-2xl font-bold"
                style={{ backgroundColor: data.colorPrimario, color: 'white' }}
              >
                {data.nombre.charAt(0).toUpperCase()}
              </div>
            )}

            {data.logoUrl && (
              <Image src={data.logoUrl} alt="Logo" width={60} height={60} className="object-contain opacity-80" />
            )}
          </div>

          {/* Información centrada con mucho espacio */}
          <div className="text-center mb-16 space-y-4">
            <h1 className="text-5xl font-light tracking-tight" style={{ color: data.colorTexto }}>
              {data.nombre}
            </h1>
            {data.puesto && (
              <p className="text-xl font-light tracking-wide" style={{ color: data.colorPrimario }}>
                {data.puesto}
              </p>
            )}
            {data.empresa && (
              <p className="text-lg font-light opacity-60" style={{ color: data.colorTexto }}>
                {data.empresa}
              </p>
            )}
          </div>

          {/* Contacto minimalista */}
          <div className="space-y-6 max-w-md mx-auto">
            {data.email && (
              <a
                href={`mailto:${data.email}`}
                className="block text-center py-4 rounded-lg transition-all hover:shadow-md"
                style={{ backgroundColor: `${data.colorPrimario}05` }}
              >
                <Mail className="w-5 h-5 mx-auto mb-2" style={{ color: data.colorPrimario }} />
                <span className="text-sm font-light" style={{ color: data.colorTexto }}>{data.email}</span>
              </a>
            )}

            {data.whatsapp && (
              <a
                href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`}
                className="block text-center py-4 rounded-lg transition-all hover:shadow-md"
                style={{ backgroundColor: '#25D36605' }}
              >
                <MessageCircle className="w-5 h-5 mx-auto mb-2 text-green-600" />
                <span className="text-sm font-light" style={{ color: data.colorTexto }}>{data.whatsapp}</span>
              </a>
            )}

            {data.telefonoMovil && (
              <a
                href={`tel:${data.telefonoMovil}`}
                className="block text-center py-4 rounded-lg transition-all hover:shadow-md"
                style={{ backgroundColor: `${data.colorPrimario}05` }}
              >
                <Smartphone className="w-5 h-5 mx-auto mb-2" style={{ color: data.colorPrimario }} />
                <span className="text-sm font-light" style={{ color: data.colorTexto }}>{data.telefonoMovil}</span>
              </a>
            )}

            {data.sitioWeb && (
              <a
                href={data.sitioWeb}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center py-4 rounded-lg transition-all hover:shadow-md"
                style={{ backgroundColor: `${data.colorPrimario}05` }}
              >
                <Globe className="w-5 h-5 mx-auto mb-2" style={{ color: data.colorPrimario }} />
                <span className="text-sm font-light" style={{ color: data.colorTexto }}>{data.sitioWeb}</span>
              </a>
            )}
          </div>

          {/* Redes sociales minimalistas */}
          {data.redesSociales && Object.keys(data.redesSociales).length > 0 && (
            <div className="flex justify-center gap-6 mt-16 pt-8 border-t" style={{ borderColor: `${data.colorPrimario}15` }}>
              {data.redesSociales.linkedin && (
                <a
                  href={data.redesSociales.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Linkedin className="w-full h-full" style={{ color: data.colorPrimario }} />
                </a>
              )}
              {data.redesSociales.twitter && (
                <a
                  href={data.redesSociales.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Twitter className="w-full h-full" style={{ color: data.colorPrimario }} />
                </a>
              )}
              {data.redesSociales.facebook && (
                <a
                  href={data.redesSociales.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Facebook className="w-full h-full" style={{ color: data.colorPrimario }} />
                </a>
              )}
              {data.redesSociales.instagram && (
                <a
                  href={data.redesSociales.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Instagram className="w-full h-full" style={{ color: data.colorPrimario }} />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Plantilla Corporate (diseño profesional con sidebar)
export function CorporateTemplate({ data, isPreview = false }: CardTemplateProps) {
  const fontStyle = { fontFamily: data.fontFamily };
  const bgPattern = getBackgroundStyle(data.backgroundPattern, data.colorPrimario);

  return (
    <div className="w-full max-w-2xl mx-auto" style={fontStyle}>
      <div className="rounded-xl shadow-xl overflow-hidden flex" style={{ backgroundColor: data.colorFondo }}>
        {/* Sidebar vertical con gradiente */}
        <div
          className="w-24 relative"
          style={{ background: `linear-gradient(180deg, ${data.colorPrimario} 0%, ${data.colorSecundario} 100%)` }}
        >
          {/* Logo en sidebar */}
          {data.logoUrl && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white p-2 rounded-lg shadow-lg">
              <Image src={data.logoUrl} alt="Logo" width={45} height={45} className="object-contain" />
            </div>
          )}

          {/* Redes sociales verticales */}
          {data.redesSociales && Object.keys(data.redesSociales).length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 space-y-3">
              {data.redesSociales.linkedin && (
                <a
                  href={data.redesSociales.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <Linkedin className="w-5 h-5 text-white" />
                </a>
              )}
              {data.redesSociales.twitter && (
                <a
                  href={data.redesSociales.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <Twitter className="w-5 h-5 text-white" />
                </a>
              )}
              {data.redesSociales.facebook && (
                <a
                  href={data.redesSociales.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <Facebook className="w-5 h-5 text-white" />
                </a>
              )}
              {data.redesSociales.instagram && (
                <a
                  href={data.redesSociales.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <Instagram className="w-5 h-5 text-white" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Contenido principal */}
        <div className="flex-1 p-8" style={bgPattern}>
          {/* Header con foto */}
          <div className="flex items-start gap-6 mb-8">
            {data.fotoPerfilUrl ? (
              <Image
                src={data.fotoPerfilUrl}
                alt={data.nombre}
                width={100}
                height={100}
                className="rounded-xl shadow-lg object-cover"
              />
            ) : (
              <div
                className="w-24 h-24 rounded-xl shadow-lg flex items-center justify-center text-3xl font-bold"
                style={{ backgroundColor: data.colorPrimario, color: 'white' }}
              >
                {data.nombre.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2" style={{ color: data.colorTexto }}>
                {data.nombre}
              </h1>
              {data.puesto && (
                <p className="text-lg font-semibold mb-1" style={{ color: data.colorPrimario }}>
                  {data.puesto}
                </p>
              )}
              {data.empresa && (
                <p className="text-md opacity-70" style={{ color: data.colorTexto }}>
                  {data.empresa}
                </p>
              )}
            </div>
          </div>

          {/* Lista de contacto estructurada */}
          <div className="space-y-3">
            {data.email && (
              <a
                href={`mailto:${data.email}`}
                className="flex items-center gap-4 p-3 rounded-lg transition-all hover:scale-[1.02]"
                style={{ backgroundColor: `${data.colorPrimario}08` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: data.colorPrimario }}
                >
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium opacity-60" style={{ color: data.colorTexto }}>Email</div>
                  <div className="text-sm font-medium truncate" style={{ color: data.colorTexto }}>{data.email}</div>
                </div>
              </a>
            )}

            {data.whatsapp && (
              <a
                href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`}
                className="flex items-center gap-4 p-3 rounded-lg transition-all hover:scale-[1.02]"
                style={{ backgroundColor: `${data.colorPrimario}08` }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-500">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium opacity-60" style={{ color: data.colorTexto }}>WhatsApp</div>
                  <div className="text-sm font-medium truncate" style={{ color: data.colorTexto }}>{data.whatsapp}</div>
                </div>
              </a>
            )}

            {data.telefonoMovil && (
              <a
                href={`tel:${data.telefonoMovil}`}
                className="flex items-center gap-4 p-3 rounded-lg transition-all hover:scale-[1.02]"
                style={{ backgroundColor: `${data.colorPrimario}08` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: data.colorPrimario }}
                >
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium opacity-60" style={{ color: data.colorTexto }}>Teléfono</div>
                  <div className="text-sm font-medium" style={{ color: data.colorTexto }}>{data.telefonoMovil}</div>
                </div>
              </a>
            )}

            {data.sitioWeb && (
              <a
                href={data.sitioWeb}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-3 rounded-lg transition-all hover:scale-[1.02]"
                style={{ backgroundColor: `${data.colorPrimario}08` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: data.colorPrimario }}
                >
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium opacity-60" style={{ color: data.colorTexto }}>Sitio Web</div>
                  <div className="text-sm font-medium truncate" style={{ color: data.colorTexto }}>{data.sitioWeb}</div>
                </div>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Plantilla Bold (audaz con alto contraste)
export function BoldTemplate({ data, isPreview = false }: CardTemplateProps) {
  const fontStyle = { fontFamily: data.fontFamily };
  const bgPattern = getBackgroundStyle(data.backgroundPattern, data.colorPrimario);

  return (
    <div className="w-full max-w-2xl mx-auto" style={fontStyle}>
      <div className="rounded-2xl shadow-2xl overflow-hidden border-4 border-black">
        {/* Header con gradiente vibrante */}
        <div
          className="h-48 relative"
          style={{ background: `linear-gradient(45deg, ${data.colorPrimario} 0%, ${data.colorSecundario} 100%)` }}
        >
          {/* Logo en esquina superior derecha */}
          {data.logoUrl && (
            <div className="absolute top-4 right-4 bg-black p-3 rounded-xl shadow-xl">
              <Image src={data.logoUrl} alt="Logo" width={50} height={50} className="object-contain" />
            </div>
          )}

          {/* Foto de perfil superpuesta */}
          <div className="absolute -bottom-16 left-8">
            {data.fotoPerfilUrl ? (
              <Image
                src={data.fotoPerfilUrl}
                alt={data.nombre}
                width={130}
                height={130}
                className="rounded-2xl shadow-2xl object-cover border-6 border-black"
              />
            ) : (
              <div
                className="w-32 h-32 rounded-2xl shadow-2xl flex items-center justify-center text-4xl font-black border-6 border-black"
                style={{ backgroundColor: data.colorPrimario, color: 'white' }}
              >
                {data.nombre.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Contenido con fondo blanco */}
        <div className="bg-white px-8 pt-20 pb-8" style={bgPattern}>
          {/* Información */}
          <div className="mb-8">
            <h1 className="text-4xl font-black mb-2 tracking-tight" style={{ color: 'black' }}>
              {data.nombre}
            </h1>
            {data.puesto && (
              <p
                className="text-2xl font-bold mb-1"
                style={{ color: data.colorPrimario }}
              >
                {data.puesto}
              </p>
            )}
            {data.empresa && (
              <p className="text-lg font-semibold text-gray-600">
                {data.empresa}
              </p>
            )}
          </div>

          {/* Botones de contacto con colores vibrantes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {data.email && (
              <a
                href={`mailto:${data.email}`}
                className="flex items-center gap-3 p-4 rounded-xl shadow-lg font-bold transition-all hover:scale-105"
                style={{ backgroundColor: data.colorPrimario, color: 'white' }}
              >
                <Mail className="w-6 h-6" />
                <span className="text-sm truncate">{data.email}</span>
              </a>
            )}

            {data.whatsapp && (
              <a
                href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`}
                className="flex items-center gap-3 p-4 rounded-xl shadow-lg font-bold transition-all hover:scale-105 bg-green-500 text-white"
              >
                <MessageCircle className="w-6 h-6" />
                <span className="text-sm truncate">{data.whatsapp}</span>
              </a>
            )}

            {data.telefonoMovil && (
              <a
                href={`tel:${data.telefonoMovil}`}
                className="flex items-center gap-3 p-4 rounded-xl shadow-lg font-bold transition-all hover:scale-105"
                style={{ backgroundColor: data.colorSecundario, color: 'white' }}
              >
                <Smartphone className="w-6 h-6" />
                <span className="text-sm">{data.telefonoMovil}</span>
              </a>
            )}

            {data.sitioWeb && (
              <a
                href={data.sitioWeb}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 rounded-xl shadow-lg font-bold transition-all hover:scale-105 bg-black text-white"
              >
                <Globe className="w-6 h-6" />
                <span className="text-sm truncate">{data.sitioWeb}</span>
              </a>
            )}
          </div>

          {/* Redes sociales con fondos de marca */}
          {data.redesSociales && Object.keys(data.redesSociales).length > 0 && (
            <div className="flex justify-center gap-3 pt-6 border-t-4 border-black">
              {data.redesSociales.linkedin && (
                <a
                  href={data.redesSociales.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                  style={{ backgroundColor: '#0077B5' }}
                >
                  <Linkedin className="w-7 h-7 text-white" />
                </a>
              )}
              {data.redesSociales.twitter && (
                <a
                  href={data.redesSociales.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                  style={{ backgroundColor: '#1DA1F2' }}
                >
                  <Twitter className="w-7 h-7 text-white" />
                </a>
              )}
              {data.redesSociales.facebook && (
                <a
                  href={data.redesSociales.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  <Facebook className="w-7 h-7 text-white" />
                </a>
              )}
              {data.redesSociales.instagram && (
                <a
                  href={data.redesSociales.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-14 h-14 rounded-xl flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                  style={{ background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)' }}
                >
                  <Instagram className="w-7 h-7 text-white" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// Plantilla Glass Pro (Nuevo Diseño 2025)
export function GlassProTemplate({ data, isPreview = false }: CardTemplateProps) {
  const fontStyle = { fontFamily: data.fontFamily || 'Inter' };
  const bgPattern = getBackgroundStyle(data.backgroundPattern, data.colorPrimario);

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-8" style={fontStyle}>
      <div
        className="relative rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/20 backdrop-blur-xl"
        style={{ backgroundColor: `${data.colorFondo}99`, ...bgPattern }}
      >
        {/* Orbes de luz decorativos (Glassmorphism Effect) */}
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px] opacity-20 animate-pulse"
          style={{ backgroundColor: data.colorPrimario }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-[80px] opacity-20"
          style={{ backgroundColor: data.colorSecundario }}
        />

        {/* Banner con gradiente moderno */}
        <div className="h-48 relative overflow-hidden">
          {data.bannerUrl ? (
            <Image src={data.bannerUrl} alt="Banner" fill className="object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: `linear-gradient(135deg, ${data.colorPrimario}, ${data.colorSecundario})` }}
            />
          )}
          {/* Logo flotante */}
          {data.logoUrl && (
            <div className="absolute top-6 right-6 backdrop-blur-md bg-white/10 p-3 rounded-2xl border border-white/20 shadow-lg">
              <Image src={data.logoUrl} alt="Logo" width={50} height={50} className="object-contain filter brightness-110" />
            </div>
          )}
        </div>

        {/* Perfil flotante */}
        <div className="relative px-8 -mt-20 flex flex-col items-center">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-white to-transparent rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
            {data.fotoPerfilUrl ? (
              <Image
                src={data.fotoPerfilUrl}
                alt={data.nombre}
                width={160}
                height={160}
                className="relative rounded-full border-[6px] border-white shadow-2xl object-cover"
              />
            ) : (
              <div
                className="relative w-40 h-40 rounded-full border-[6px] border-white shadow-2xl flex items-center justify-center text-5xl font-bold text-white"
                style={{ backgroundColor: data.colorPrimario }}
              >
                {data.nombre.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info Principal */}
          <div className="mt-6 text-center space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: data.colorTexto }}>
              {data.nombre}
            </h1>
            {data.puesto && (
              <span
                className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide uppercase shadow-sm"
                style={{ backgroundColor: `${data.colorPrimario}15`, color: data.colorPrimario }}
              >
                {data.puesto}
              </span>
            )}
            {data.empresa && (
              <p className="text-lg font-medium opacity-60" style={{ color: data.colorTexto }}>
                {data.empresa}
              </p>
            )}
          </div>

          {/* Acciones Rápidas (Iconos modernos) */}
          <div className="grid grid-cols-4 gap-4 w-full mt-10">
            {data.telefonoMovil && (
              <a href={`tel:${data.telefonoMovil}`} className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-slate-50 transition-all duration-300">
                  <Phone className="w-6 h-6" style={{ color: data.colorPrimario }} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Llamar</span>
              </a>
            )}
            {data.email && (
              <a href={`mailto:${data.email}`} className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-slate-50 transition-all duration-300">
                  <Mail className="w-6 h-6" style={{ color: data.colorPrimario }} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Email</span>
              </a>
            )}
            {data.whatsapp && (
              <a href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`} className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-slate-50 transition-all duration-300">
                  <MessageCircle className="w-6 h-6 text-green-500" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Chat</span>
              </a>
            )}
            {data.sitioWeb && (
              <a href={data.sitioWeb} target="_blank" className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-slate-50 transition-all duration-300">
                  <Globe className="w-6 h-6" style={{ color: data.colorPrimario }} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Web</span>
              </a>
            )}
          </div>

          {/* Social Links (Premium Pills) */}
          <div className="w-full mt-12 pb-12 space-y-3">
            {data.redesSociales && Object.entries(data.redesSociales).map(([key, url]) => {
              if (!url) return null;
              const icons: any = { linkedin: <Linkedin />, twitter: <Twitter />, facebook: <Facebook />, instagram: <Instagram /> };
              if (!icons[key]) return null;

              return (
                <a
                  key={key}
                  href={url as string}
                  target="_blank"
                  className="flex items-center justify-between w-full p-4 rounded-2xl bg-white/50 backdrop-blur-sm border border-white hover:bg-white/80 hover:shadow-lg transition-all duration-300 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                      {icons[key]}
                    </div>
                    <span className="font-bold capitalize" style={{ color: data.colorTexto }}>{key}</span>
                  </div>
                  <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all">
                    <Send className="w-4 h-4" />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


// Componente principal que renderiza la plantilla correcta
export function CardRenderer({ data, isPreview = false }: CardTemplateProps) {
  switch (data.template) {
    case 'classic':
      return <ClassicTemplate data={data} isPreview={isPreview} />;
    case 'modern':
      return <ModernTemplate data={data} isPreview={isPreview} />;
    case 'elegant':
      return <ElegantTemplate data={data} isPreview={isPreview} />;
    case 'minimal':
      return <MinimalTemplate data={data} isPreview={isPreview} />;
    case 'corporate':
      return <CorporateTemplate data={data} isPreview={isPreview} />;
    case 'bold':
      return <BoldTemplate data={data} isPreview={isPreview} />;
    case 'glass-pro':
      return <GlassProTemplate data={data} isPreview={isPreview} />;
    default:
      return <ModernTemplate data={data} isPreview={isPreview} />;
  }
}

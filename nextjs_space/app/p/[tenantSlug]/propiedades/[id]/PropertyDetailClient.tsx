'use client';

import { useEffect, useState } from 'react';
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers';
import {
  formatOperationLabel,
  formatearPrecioInmueble,
  priceSuffix,
} from '@/lib/real-estate/operation-labels';
import {
  colorTextoEnClaro,
  fondoConTextoBlanco,
  fondoHeroMarca,
} from '@/lib/real-estate/contraste';
import { tokensPortal, type PlantillaPortal } from '@/lib/real-estate/portal-templates';
import { ESCALA_ENERGETICA, esClaseEnTramite } from '@/lib/real-estate/energia';
import { SERVICIOS_TODOS } from '@/lib/real-estate/property-editor-config';
import CalculadoraHipotecaria from '@/components/real-estate/CalculadoraHipotecaria';
import PortalAnalyticsBeacon, {
  enviarEventoPortal,
} from '@/components/real-estate/PortalAnalyticsBeacon';
import {
  normalizarOrigen,
  urlCompartirWhatsapp,
  urlConOrigen,
  type OrigenPortal,
} from '@/lib/real-estate/portal-seo';
import {
  mensajeWhatsappPropiedad,
  urlWhatsapp,
} from '@/lib/real-estate/portal-branding';

const ESTADOS_FICHA: Record<string, { label: string; color: string }> = {
  disponible: { label: 'Disponible', color: '#10b981' },
  reservada: { label: 'Reservada', color: '#f59e0b' },
  vendida: { label: 'Vendida', color: '#ef4444' },
  alquilada: { label: 'Alquilada', color: '#8b5cf6' },
};

interface Props {
  property: InmuebleParsed;
  tenant: { id: string; nombre: string; moneda: string };
  tenantSlug: string;
  brandingColor: string;
  /** Nombre comercial de la marca (fallback: el de la cuenta). */
  brandingNombre?: string;
  brandingLogo?: string;
  brandingClaim?: string;
  /** WhatsApp de la oficina, en dígitos; activa el botón directo. */
  brandingTelefono?: string;
  /** Plantilla del portal: mismo hero, radios y tipografía que el resto. */
  plantilla: PlantillaPortal;
  images: Array<{ url: string; alt: string }>;
  formattedPrice: string;
  relatedProperties: InmuebleParsed[];
}

export default function PropertyDetailClient({
  property,
  tenant,
  tenantSlug,
  brandingColor,
  brandingNombre,
  brandingLogo,
  brandingClaim,
  brandingTelefono,
  plantilla,
  images,
  formattedPrice,
  relatedProperties,
}: Props) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [contactLoading, setContactLoading] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState('');
  /**
   * Origen del visitante (`?origen=whatsapp`). Se lee en el cliente para no
   * forzar la ficha a render dinámico: llega del enlace compartido y viaja con
   * el formulario, de modo que el lead diga de dónde vino.
   */
  const [origen, setOrigen] = useState<OrigenPortal | null>(null);
  const [enlaceWhatsapp, setEnlaceWhatsapp] = useState('');
  const [whatsappOficina, setWhatsappOficina] = useState<string | null>(null);

  useEffect(() => {
    const parametro = new URLSearchParams(window.location.search).get('origen');
    const normalizado = normalizarOrigen(parametro);
    setOrigen(normalizado);

    const enlaceFicha = `${window.location.origin}/p/${tenantSlug}/propiedades/${property.id}`;

    setEnlaceWhatsapp(
      urlCompartirWhatsapp({
        url: enlaceFicha,
        nombre: property.nombre,
        precio: formattedPrice,
      })
    );

    // Contacto directo con la oficina: el mensaje lleva la ficha con origen para
    // que, si el visitante acaba enviando el formulario, el lead diga de dónde vino.
    setWhatsappOficina(
      brandingTelefono
        ? urlWhatsapp(
            brandingTelefono,
            mensajeWhatsappPropiedad(property.nombre, urlConOrigen(enlaceFicha, 'whatsapp'))
          )
        : null
    );
  }, [tenantSlug, property.id, property.nombre, formattedPrice, brandingTelefono]);

  const tokens = tokensPortal(plantilla);
  const accion = fondoConTextoBlanco(brandingColor);
  const acento = colorTextoEnClaro(brandingColor);
  const heroMarca = tokens.hero === 'marca' ? fondoHeroMarca(brandingColor) : null;

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactLoading(true);
    setContactError('');

    try {
      const res = await fetch('/api/public/real-estate/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: tenantSlug,
          propertyId: property.id,
          name: contactForm.name,
          email: contactForm.email,
          phone: contactForm.phone,
          message: contactForm.message,
          // Sin origen el lead se guarda igual; con origen, el asesor sabe si
          // llegó por WhatsApp, un QR o un email.
          ...(origen ? { origen } : {}),
        }),
      });

      if (res.ok) {
        setContactSuccess(true);
        setContactForm({ name: '', email: '', phone: '', message: '' });
      } else {
        const data = await res.json();
        setContactError(data.error || 'Error al enviar el mensaje');
      }
    } catch {
      setContactError('Error de conexión. Intente de nuevo.');
    } finally {
      setContactLoading(false);
    }
  };

  const statusInfo = ESTADOS_FICHA[property.status] || ESTADOS_FICHA.disponible;

  // Formulario, WhatsApp de la oficina y compartir cuentan igual: el interés se
  // registra en un solo sitio, sin repetir el payload tres veces.
  const registrarInteres = () =>
    enviarEventoPortal({ slug: tenantSlug, tipo: 'clic_contacto', propiedadId: property.id });

  // El editor por secciones cuenta los dormitorios en `habitaciones_detalle`
  // y deja `habitaciones` como respaldo: manda el detalle si existe.
  const dormitorios = property.bedrooms ?? property.roomsDetail?.dormitorio ?? null;

  // Servicios marcados en el editor, con su rótulo legible.
  const servicioLabels = (property.servicios || [])
    .map((id) => SERVICIOS_TODOS.find((s) => s.id === id)?.label)
    .filter((label): label is string => Boolean(label));

  return (
    // `text-gray-900`: la ficha es un diseño claro, pero cuelga del tema global.
    // Bajo `.dark` el `foreground` es casi blanco y todo texto sin clase de color
    // (los valores del resumen) desaparecía sobre las tarjetas blancas.
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <PortalAnalyticsBeacon slug={tenantSlug} tipo="visita_ficha" propiedadId={property.id} />

      {/* Navigation Bar */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href={`/p/${tenantSlug}/propiedades`}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Volver a propiedades</span>
          </a>
          <div className="flex items-center gap-2">
            {brandingLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandingLogo}
                alt={brandingNombre || tenant.nombre}
                className="h-6 max-w-[90px] object-contain"
              />
            )}
            <span className="text-sm text-gray-400">{brandingNombre || tenant.nombre}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* La plantilla de marca abre la ficha con el bloque de color, igual
            que la portada y el catálogo: las tres páginas se abren igual. */}
        {heroMarca && (
          <div
            className={`mb-6 overflow-hidden ${tokens.radio}`}
            style={{
              backgroundImage: `linear-gradient(135deg, ${heroMarca.base} 0%, ${heroMarca.fin} 100%)`,
              color: heroMarca.texto,
            }}
          >
            <div className="px-6 py-8 md:px-10 md:py-12">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest"
                  style={{ borderColor: `${heroMarca.texto}55` }}
                >
                  {formatOperationLabel(property.operationType)}
                </span>
                <span className="text-xs font-medium opacity-80">{statusInfo.label}</span>
              </div>
              <h1 className={`mt-3 ${tokens.tituloPrincipal}`}>{property.nombre}</h1>
              {(property.address || property.city) && (
                <p className="mt-2 text-sm opacity-85">
                  {[property.address, property.city].filter(Boolean).join(', ')}
                </p>
              )}
              {brandingClaim && (
                <p className="mt-2 max-w-xl text-sm opacity-85">{brandingClaim}</p>
              )}
              <p className="mt-4 text-3xl font-bold">
                {formattedPrice}
                <span className="text-base font-normal opacity-70">
                  {priceSuffix(property.operationType)}
                </span>
              </p>
            </div>
          </div>
        )}
        {/* Image Gallery */}
        <div className={`bg-white ${tokens.radio} shadow-sm overflow-hidden mb-8`}>
          <div className="relative h-[400px] md:h-[500px] bg-gray-100">
            {images.length > 0 ? (
              <img
                src={images[selectedImage]?.url || ''}
                alt={images[selectedImage]?.alt || property.nombre}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300">
                <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}

            {/* Insignias: con hero de marca, operación y estado ya van arriba;
                aquí solo queda lo que el bloque de color no dice. */}
            <div className="absolute top-4 left-4 flex gap-2">
              {!heroMarca && (
                <>
                  <span className="bg-white/90 backdrop-blur-sm text-sm font-semibold px-3 py-1.5 rounded-full shadow-sm"
                    style={{ color: acento }}
                  >
                    {formatOperationLabel(property.operationType)}
                  </span>
                  <span className="text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-sm"
                    style={{ backgroundColor: statusInfo.color }}
                  >
                    {statusInfo.label}
                  </span>
                </>
              )}
              {property.featured && (
                <span className="bg-amber-400 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-sm">
                  DESTACADA
                </span>
              )}
            </div>
          </div>

          {/* Thumbnail Strip */}
          {images.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    idx === selectedImage
                      ? 'border-current opacity-100'
                      : 'border-transparent opacity-60 hover:opacity-90'
                  }`}
                  style={{ borderColor: idx === selectedImage ? acento : undefined }}
                >
                  <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title & Price */}
            <div className={`bg-white ${tokens.radio} p-6 shadow-sm`}>
              {!heroMarca && (
                <>
                  <h1 className={`${tokens.tituloPrincipal} text-gray-900`}>{property.nombre}</h1>
              {property.address && (
                <p className="text-gray-500 mt-1 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {property.address}{property.city ? `, ${property.city}` : ''}
                </p>
              )}
              <div className="flex items-baseline justify-between mt-4">
                <div>
                  <span className="text-4xl font-bold" style={{ color: acento }}>
                    {formattedPrice}
                  </span>
                  {property.operationType === 'alquiler' && (
                    <span className="text-gray-500 text-base">/mes</span>
                  )}
                  {property.operationType === 'alquiler_temporada' && (
                    <span className="text-gray-500 text-base">/noche</span>
                  )}
                </div>
                {property.propertyType && (
                  <span className="text-sm text-gray-400 capitalize">{property.propertyType}</span>
                )}
              </div>
                </>
              )}
              {heroMarca && property.propertyType && (
                <p className="text-sm capitalize text-gray-400">{property.propertyType}</p>
              )}
              {property.descripcion && (
                <p className="mt-4 text-gray-600 leading-relaxed">{property.descripcion}</p>
              )}
            </div>

            {/* Key Features */}
            <div className={`bg-white ${tokens.radio} p-6 shadow-sm`}>
              <h2 className={`text-xl ${tokens.titulo} text-gray-900 mb-4`}>Características</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {property.areaM2 && (
                  <FeatureCard icon="📐" label="Superficie" value={`${property.areaM2} m²`} />
                )}
                {property.builtM2 && (
                  <FeatureCard icon="🏗️" label="Construidos" value={`${property.builtM2} m²`} />
                )}
                {dormitorios && (
                  <FeatureCard icon="🛏️" label="Habitaciones" value={`${dormitorios}`} />
                )}
                {property.bathrooms && (
                  <FeatureCard icon="🚿" label="Baños" value={`${property.bathrooms}`} />
                )}
                {property.parking && (
                  <FeatureCard icon="🚗" label="Estacionamientos" value={`${property.parking}`} />
                )}
                {property.yearBuilt && (
                  <FeatureCard icon="📅" label="Antigüedad" value={`${property.yearBuilt} años`} />
                )}
                {property.hasElevator && <FeatureCard icon="🛗" label="Ascensor" value="Sí" />}
                {property.hasParking && <FeatureCard icon="🅿️" label="Parking" value="Sí" />}
                {property.hasPool && <FeatureCard icon="🏊" label="Alberca" value="Sí" />}
                {property.hasGarden && <FeatureCard icon="🌳" label="Jardín" value="Sí" />}
                {property.hasStorageRoom && <FeatureCard icon="📦" label="Trastero" value="Sí" />}
                {property.hasTerrace && <FeatureCard icon="🌤️" label="Terraza" value="Sí" />}
                {property.hasBalcony && <FeatureCard icon="🪟" label="Balcón" value="Sí" />}
                {property.hasAirConditioning && <FeatureCard icon="❄️" label="Aire acondicionado" value="Sí" />}
                {property.hasHeating && <FeatureCard icon="🔥" label="Calefacción" value="Sí" />}
                {property.furnished && <FeatureCard icon="🛋️" label="Amueblado" value="Sí" />}
                {property.orientation && (
                  <FeatureCard icon="🧭" label="Orientación" value={property.orientation} />
                )}
              </div>
            </div>

            {/* Servicios y equipamiento marcados en el editor */}
            {servicioLabels.length > 0 && (
              <div className={`bg-white ${tokens.radio} p-6 shadow-sm`}>
                <h2 className={`text-xl ${tokens.titulo} text-gray-900 mb-4`}>Servicios y equipamiento</h2>
                <div className="flex flex-wrap gap-2">
                  {servicioLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Clasificación energética: letra, índices y escala A–G */}
            {(property.energyCert ||
              property.energyCertConsumption != null ||
              property.energyCertEmission != null) && (
              <div className={`bg-white ${tokens.radio} p-6 shadow-sm`}>
                <h2 className={`text-xl ${tokens.titulo} text-gray-900 mb-4`}>Clasificación energética</h2>
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {property.energyCert && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm text-gray-600">Clasificación energética</span>
                      <span className="text-sm font-semibold text-gray-900">{property.energyCert}</span>
                    </div>
                  )}
                  {property.energyCertConsumption != null && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm text-gray-600">Índice de rendimiento energético</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {property.energyCertConsumption} kWh/m²·año
                      </span>
                    </div>
                  )}
                  {property.energyCertEmission != null && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm text-gray-600">Emisiones CO₂</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {property.energyCertEmission} kg/m²·año
                      </span>
                    </div>
                  )}
                  {property.energyCertBody && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm text-gray-600">Organismo certificador</span>
                      <span className="text-sm font-semibold text-gray-900">{property.energyCertBody}</span>
                    </div>
                  )}
                  {property.energyCertExpiry && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm text-gray-600">Válido hasta</span>
                      <span className="text-sm font-semibold text-gray-900">{property.energyCertExpiry}</span>
                    </div>
                  )}
                </div>

                {esClaseEnTramite(property.energyCert) ? (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Certificado energético en trámite.
                  </p>
                ) : property.energyCert ? (
                  <EscalaEnergetica clase={property.energyCert} />
                ) : null}

                {property.energyCertUrl && (
                  <a
                    href={property.energyCertUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium hover:underline"
                    style={{ color: acento }}
                  >
                    Ver certificado energético
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            )}

            {/* Long Description */}
            {property.longDescription && (
              <div className={`bg-white ${tokens.radio} p-6 shadow-sm`}>
                <h2 className={`text-xl ${tokens.titulo} text-gray-900 mb-3`}>Descripción Detallada</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{property.longDescription}</p>
              </div>
            )}

            {/* Map */}
            {property.lat && property.lng && (
              <div className={`bg-white ${tokens.radio} p-6 shadow-sm`}>
                <h2 className={`text-xl ${tokens.titulo} text-gray-900 mb-3`}>Ubicación</h2>
                <div className="rounded-xl overflow-hidden h-[300px] bg-gray-100">
                  <iframe
                    title="Ubicación de la propiedad"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0 }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${property.lng - 0.01},${property.lat - 0.01},${property.lng + 0.01},${property.lat + 0.01}&layer=mapnik&marker=${property.lat},${property.lng}`}
                    allowFullScreen
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {property.address ? `${property.address}, ` : ''} {property.city || ''}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Contact Card */}
            <div className={`bg-white ${tokens.radio} p-6 shadow-sm sticky top-24`}>
              {!showContactForm ? (
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">¿Te interesa?</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Contáctanos para más información o agendar una visita
                  </p>
                  <button
                    onClick={() => {
                      registrarInteres();
                      setShowContactForm(true);
                      setContactForm({
                        name: '',
                        email: '',
                        phone: '',
                        message: `Hola, me interesa la propiedad: ${property.nombre}`,
                      });
                    }}
                    className={`w-full py-3 px-4 text-white font-medium ${tokens.radioControl} hover:opacity-90 transition-all transform hover:scale-[1.02] active:scale-[0.98]`}
                    style={{ backgroundColor: accion }}
                  >
                    Solicitar Información
                  </button>

                  {whatsappOficina && (
                    <a
                      href={whatsappOficina}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={registrarInteres}
                      className={`mt-3 flex w-full items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 py-2.5 px-4 text-sm font-medium text-emerald-800 hover:bg-emerald-100 ${tokens.radioControl} transition-colors`}
                    >
                      Escribir por WhatsApp
                    </a>
                  )}

                  {enlaceWhatsapp && (
                    <a
                      href={enlaceWhatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={registrarInteres}
                      className={`mt-3 flex w-full items-center justify-center gap-2 border border-gray-200 py-2.5 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 ${tokens.radioControl} transition-colors`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1-1.03 2.45 0 1.44 1.05 2.84 1.2 3.04.15.2 2.07 3.16 5.02 4.43.7.3 1.25.48 1.68.62.71.22 1.35.19 1.86.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.05 2C6.5 2 2 6.5 2 12.05c0 1.77.46 3.5 1.34 5.02L2 22l5.05-1.32a10 10 0 0 0 5 1.27h.01c5.54 0 10.04-4.5 10.04-10.05C22.1 6.5 17.6 2 12.05 2zm0 18.17h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.1.81.83-3.02-.2-.31a8.16 8.16 0 0 1-1.25-4.36c0-4.52 3.68-8.2 8.21-8.2 2.19 0 4.25.86 5.8 2.4a8.15 8.15 0 0 1 2.4 5.8c0 4.53-3.68 8.21-8.2 8.21z" />
                      </svg>
                      Compartir por WhatsApp
                    </a>
                  )}
                </div>
              ) : contactSuccess ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">¡Mensaje enviado!</h3>
                  <p className="text-sm text-gray-500 mb-4">Te contactaremos pronto.</p>
                  <button
                    onClick={() => {
                      setShowContactForm(false);
                      setContactSuccess(false);
                    }}
                    className="text-sm font-medium hover:underline"
                    style={{ color: acento }}
                  >
                    Volver
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Contacto</h3>
                    <button
                      type="button"
                      onClick={() => setShowContactForm(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className={`w-full border border-gray-300 ${tokens.radioControl} px-3 py-2 text-sm focus:ring-2 focus:outline-none`}
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className={`w-full border border-gray-300 ${tokens.radioControl} px-3 py-2 text-sm focus:ring-2 focus:outline-none`}
                      placeholder="tu@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      className={`w-full border border-gray-300 ${tokens.radioControl} px-3 py-2 text-sm focus:ring-2 focus:outline-none`}
                      placeholder="+34 612 345 678"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje</label>
                    <textarea
                      rows={3}
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      className={`w-full border border-gray-300 ${tokens.radioControl} px-3 py-2 text-sm focus:ring-2 focus:outline-none`}
                    />
                  </div>

                  {contactError && (
                    <p className="text-red-500 text-sm">{contactError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={contactLoading}
                    className={`w-full py-3 px-4 text-white font-medium ${tokens.radioControl} hover:opacity-90 transition-all disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]`}
                    style={{ backgroundColor: accion }}
                  >
                    {contactLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Enviando...
                      </span>
                    ) : (
                      'Enviar Mensaje'
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Property Summary Card */}
            <div className={`bg-white ${tokens.radio} p-6 shadow-sm`}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Resumen</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Operación</span>
                  <span className="font-medium capitalize">{formatOperationLabel(property.operationType)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className="font-medium capitalize">{property.propertyType || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Estado</span>
                  <span className="font-medium" style={{ color: statusInfo.color }}>{statusInfo.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ubicación</span>
                  <span className="font-medium">{property.city || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Superficie</span>
                  <span className="font-medium">{property.areaM2 ? `${property.areaM2} m²` : '—'}</span>
                </div>
                {property.bedrooms && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Habitaciones</span>
                    <span className="font-medium">{property.bedrooms}</span>
                  </div>
                )}
                {property.bathrooms && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Baños</span>
                    <span className="font-medium">{property.bathrooms}</span>
                  </div>
                )}
                {property.parking && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Estacionamientos</span>
                    <span className="font-medium">{property.parking}</span>
                  </div>
                )}
                {property.yearBuilt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Antigüedad</span>
                    <span className="font-medium">{property.yearBuilt} años</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Calculadora hipotecaria al final: en venta y con precio, después de
            los datos y el mapa, que es cuando el visitante ya decidió si le
            interesa el inmueble. */}
        {property.operationType === 'venta' && property.precioBase > 0 && (
          <div className="mt-8">
            <CalculadoraHipotecaria
              precioInicial={property.precioBase}
              moneda={property.moneda || tenant.moneda}
              color={accion}
            />
          </div>
        )}

        {/* Related Properties */}
        {relatedProperties.length > 0 && (
          <section className="mt-12 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Propiedades Relacionadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedProperties.map((rp) => {
                const rpImages = Array.isArray(rp.media)
                  ? rp.media.map((m: any) => (typeof m === 'string' ? m : m.url))
                  : [];
                return (
                  <a
                    key={rp.id}
                    href={`/p/${tenantSlug}/propiedades/${rp.id}`}
                    className={`bg-white ${tokens.radio} shadow-sm hover:shadow-md transition-shadow overflow-hidden group`}
                  >
                    <div className="relative h-44 bg-gray-200">
                      {rpImages[0] ? (
                        <img src={rpImages[0]} alt={rp.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-300">
                          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                      <span className="absolute top-2 right-2 bg-white/90 text-xs font-semibold px-2 py-1 rounded">
                        {rp.operationType === 'venta' ? 'Venta' : rp.operationType === 'alquiler' ? 'Alquiler' : rp.operationType}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 truncate">{rp.nombre}</h3>
                      <p className="text-lg font-bold mt-1" style={{ color: acento }}>
                        {formatearPrecioInmueble(rp.precioBase, rp.moneda)}
                        {rp.operationType === 'alquiler' && <span className="text-sm font-normal text-gray-500">/mes</span>}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                        {rp.areaM2 && <span>{rp.areaM2} m²</span>}
                        {rp.bedrooms && <span>{rp.bedrooms} hab</span>}
                        {rp.city && <span>{rp.city}</span>}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} {tenant.nombre}. Powered by Volkern
        </div>
      </footer>
    </div>
  );
}

/** Escala A–G con la letra del inmueble señalada, para la ficha pública */
function EscalaEnergetica({ clase }: { clase: string }) {
  const activa = clase.trim().toUpperCase();
  const indice = ESCALA_ENERGETICA.findIndex((e) => e.letra === activa);
  if (indice === -1) return null;

  return (
    <div className="mt-6 pt-8 relative">
      <div
        className="absolute top-0 flex flex-col items-center"
        style={{ left: `${((indice + 0.5) / ESCALA_ENERGETICA.length) * 100}%`, transform: 'translateX(-50%)' }}
      >
        <span className="whitespace-nowrap rounded bg-gray-600 px-2 py-1 text-[11px] font-medium text-white shadow-sm">
          Clase energética {activa}
        </span>
        <span className="h-2 w-2 rotate-45 bg-gray-600" />
      </div>
      <div className="flex overflow-hidden rounded-md">
        {ESCALA_ENERGETICA.map(({ letra, color, textoOscuro }) => (
          <div
            key={letra}
            title={`Clase energética ${letra}`}
            className={`flex-1 py-2 text-center text-xs font-bold ${letra === activa ? 'ring-2 ring-inset ring-gray-900' : ''}`}
            style={{ backgroundColor: color, color: textoOscuro ? '#1f2937' : '#ffffff' }}
          >
            {letra}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-sm font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

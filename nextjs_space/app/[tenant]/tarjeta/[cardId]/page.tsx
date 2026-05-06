
'use client';

import { useState, useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import Image from 'next/image';
import { Download, UserPlus, Loader2, CalendarDays, Share2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardRenderer } from '@/components/digital-cards/card-templates';
import { LeadCaptureForm } from '@/components/digital-cards/lead-capture-form';
import { toast } from 'sonner';
import QRCode from 'qrcode';

export default function TarjetaPublicaPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const cardId = params.cardId as string;
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [bookingQrCode, setBookingQrCode] = useState<string | null>(null);
  const [cardQrCode, setCardQrCode] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCardData() {
      try {
        const response = await fetch(`/api/tarjetas-digitales/public/${cardId}`);
        if (!response.ok) {
          if (response.status === 404) notFound();
          throw new Error('Error al cargar la tarjeta');
        }
        const data = await response.json();
        setCard(data.card);
        
        // Generar QR de la tarjeta para compartir
        const cardFullUrl = `${window.location.origin}/${tenant}/tarjeta/${cardId}`;
        try {
          const cardQrDataUrl = await QRCode.toDataURL(cardFullUrl, {
            width: 200,
            margin: 2,
            color: {
              dark: data.card.colorPrimario || '#000000',
              light: '#FFFFFF',
            },
          });
          setCardQrCode(cardQrDataUrl);
        } catch (qrError) {
          console.error('Error generating card QR:', qrError);
        }
        
        // Generar QR de booking si está configurado
        if (data.card.bookingUrl) {
          const bookingFullUrl = `${window.location.origin}${data.card.bookingUrl}`;
          try {
            const qrDataUrl = await QRCode.toDataURL(bookingFullUrl, {
              width: 200,
              margin: 2,
              color: {
                dark: data.card.colorPrimario || '#000000',
                light: '#FFFFFF',
              },
            });
            setBookingQrCode(qrDataUrl);
          } catch (qrError) {
            console.error('Error generating booking QR:', qrError);
          }
        }
      } catch (error) {
        console.error('Error fetching card:', error);
        toast.error('No se pudo cargar la información de la tarjeta');
      } finally {
        setLoading(false);
      }
    }

    if (cardId) {
      fetchCardData();
    }
  }, [cardId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!card || !card.activo) {
    return notFound();
  }

  // Generar vCard para descargar
  const generateVCard = () => {
    const bookingFullUrl = card.bookingUrl ? `${window.location.origin}${card.bookingUrl}` : null;
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${card.nombre}
${card.puesto ? `TITLE:${card.puesto}\n` : ''}${card.empresa ? `ORG:${card.empresa}\n` : ''}${card.telefonoMovil ? `TEL;TYPE=CELL:${card.telefonoMovil}\n` : ''}${card.telefonoOficina ? `TEL;TYPE=WORK:${card.telefonoOficina}\n` : ''}${card.email ? `EMAIL:${card.email}\n` : ''}${card.sitioWeb ? `URL:${card.sitioWeb}\n` : ''}${bookingFullUrl ? `URL;TYPE=BOOKING:${bookingFullUrl}\nNOTE:Agenda una cita conmigo: ${bookingFullUrl}\n` : ''}${card.whatsapp ? `TEL;TYPE=WHATSAPP:${card.whatsapp}\n` : ''}${card.telegram ? `X-TELEGRAM:${card.telegram}\n` : ''}END:VCARD`;
    return encodeURIComponent(vcard);
  };

  const cardData = {
    nombre: card.nombre,
    puesto: card.puesto || undefined,
    empresa: card.empresa || 'Volkern CRM',
    telefonoMovil: card.telefonoMovil || undefined,
    telefonoOficina: card.telefonoOficina || undefined,
    email: card.email || undefined,
    sitioWeb: card.sitioWeb || undefined,
    whatsapp: card.whatsapp || undefined,
    telegram: card.telegram || undefined,
    redesSociales: card.redesSociales || {},
    template: card.template,
    fontFamily: card.fontFamily,
    layoutStyle: card.layoutStyle,
    colorPrimario: card.colorPrimario,
    colorSecundario: card.colorSecundario,
    colorFondo: card.colorFondo,
    colorTexto: card.colorTexto,
    backgroundPattern: card.backgroundPattern,
    logoUrl: card.logoUrl || undefined,
    fotoPerfilUrl: card.fotoPerfilUrl || undefined,
    bannerUrl: card.bannerUrl || undefined,
  };

  return (
    <div className="min-h-screen py-12 px-4 animate-in fade-in duration-500" style={{ backgroundColor: card.colorFondo }}>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Tarjeta con diseño dinámico */}
        <CardRenderer data={cardData} isPreview={false} />

        {/* Botones de acción principal */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 px-4">
          <a
            href={`data:text/vcard;charset=utf-8,${generateVCard()}`}
            download={`${card.nombre.replace(/\s+/g, '_')}.vcf`}
            className="w-full sm:w-auto"
          >
            <Button size="lg" className="w-full gap-2 shadow-lg hover:scale-105 transition-transform" style={{ backgroundColor: card.colorPrimario }}>
              <Download className="w-5 h-5" />
              Guardar Contacto
            </Button>
          </a>

          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto gap-2 border-2 shadow-lg hover:scale-105 transition-transform"
            style={{ borderColor: card.colorPrimario, color: card.colorPrimario }}
            onClick={() => setIsConnectOpen(true)}
          >
            <UserPlus className="w-5 h-5" />
            Intercambiar Contacto
          </Button>
        </div>

        {/* QR para compartir la tarjeta */}
        {cardQrCode && (
          <div className="mt-8 px-4">
            <div 
              className="rounded-3xl p-6 text-center shadow-xl border bg-white"
              style={{ borderColor: `${card.colorPrimario}30` }}
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <Share2 className="w-6 h-6" style={{ color: card.colorPrimario }} />
                <h3 className="text-lg font-bold" style={{ color: card.colorTexto }}>
                  Comparte mi tarjeta
                </h3>
              </div>
              <p className="text-sm mb-4 text-gray-500">
                Escanea este QR para guardar mi contacto
              </p>
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-md inline-block border border-gray-100">
                  <Image
                    src={cardQrCode}
                    alt="QR de mi tarjeta"
                    width={180}
                    height={180}
                    className="rounded-lg"
                  />
                </div>
                <Button 
                  variant="outline"
                  size="lg" 
                  className="w-full sm:w-auto gap-2 shadow-lg hover:scale-105 transition-transform"
                  style={{ borderColor: card.colorPrimario, color: card.colorPrimario }}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = cardQrCode;
                    link.download = `tarjeta-qr-${card.nombre.replace(/\s+/g, '_')}.png`;
                    link.click();
                    toast.success('QR descargado');
                  }}
                >
                  <QrCode className="w-5 h-5" />
                  Descargar QR
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sección de Booking QR */}
        {card.bookingUrl && bookingQrCode && (
          <div className="mt-8 px-4">
            <div 
              className="rounded-3xl p-6 text-center shadow-xl border"
              style={{ 
                backgroundColor: `${card.colorPrimario}10`,
                borderColor: `${card.colorPrimario}30`,
              }}
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <CalendarDays className="w-6 h-6" style={{ color: card.colorPrimario }} />
                <h3 className="text-lg font-bold" style={{ color: card.colorTexto }}>
                  ¿Quieres agendar una cita?
                </h3>
              </div>
              <p className="text-sm mb-4" style={{ color: card.colorTexto, opacity: 0.7 }}>
                Escanea el QR o haz clic para reservar directamente
              </p>
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-3 rounded-2xl shadow-md inline-block">
                  <Image
                    src={bookingQrCode}
                    alt="QR para agendar cita"
                    width={150}
                    height={150}
                    className="rounded-lg"
                  />
                </div>
                <a 
                  href={card.bookingUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto"
                >
                  <Button 
                    size="lg" 
                    className="w-full gap-2 shadow-lg hover:scale-105 transition-transform"
                    style={{ backgroundColor: card.colorPrimario }}
                  >
                    <CalendarDays className="w-5 h-5" />
                    Agendar Cita
                  </Button>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Captura de Lead */}
        <LeadCaptureForm
          isOpen={isConnectOpen}
          onClose={() => setIsConnectOpen(false)}
          cardId={card.urlUnica}
          cardName={card.nombre}
          accentColor={card.colorPrimario}
        />

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-8">
          <p>
            Powered by{' '}
            <a href="https://volkern.app" className="font-semibold hover:text-gray-700">
              Volkern CRM
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowRight, RotateCcw } from 'lucide-react';

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center space-x-2">
              <Image 
                src="/volkern-logo.png" 
                alt="Volkern CRM" 
                width={120} 
                height={32} 
                className="h-8 w-auto"
              />
            </Link>
            
            <nav className="hidden md:flex items-center space-x-8">
              <Link href="/#features" className="text-gray-600 hover:text-gray-900 transition">Características</Link>
              <Link href="/precios" className="text-gray-600 hover:text-gray-900 transition">Precios</Link>
              <Link href="/#testimonials" className="text-gray-600 hover:text-gray-900 transition">Testimonios</Link>
            </nav>

            <div className="flex items-center space-x-4">
              <Link href="/login">
                <Button variant="ghost">Iniciar sesión</Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-[#1a3e6e] hover:bg-[#2d5a8e]">
                  Empezar gratis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#1a3e6e] to-[#2d5a8e] py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center mb-4">
            <RotateCcw className="h-16 w-16 text-white/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Política de Reembolsos
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Conoce nuestras condiciones de desistimiento, reembolso y cancelación.
          </p>
          <p className="text-sm text-blue-200 mt-4">Última actualización: 3 de septiembre de 2026 · Versión 2026-09</p>
        </div>
      </section>

      {/* Content */}
      <main className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 md:p-12 space-y-8">

              <p className="text-gray-600 leading-relaxed text-lg">
                Volkern CRM, operado por <strong>Dimension eXpert LLC</strong>, ofrece una prueba gratuita de 14
                días sin tarjeta y sin permanencia. Esta política explica el desistimiento, el reembolso y la
                cancelación de los planes de pago, y complementa nuestros{' '}
                <Link href="/terms" className="text-blue-600 hover:underline">Términos de Servicio</Link>.
              </p>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Derecho de Desistimiento</h2>
                <p className="text-gray-600 leading-relaxed">
                  De acuerdo con la normativa vigente en la Unión Europea, los clientes disponen de un plazo 
                  de <strong>14 días naturales</strong> desde la fecha de compra para ejercer su derecho de 
                  desistimiento.
                </p>
                <p className="text-gray-600 leading-relaxed mt-4">
                  No obstante, al tratarse de servicios digitales, este derecho estará sujeto a las condiciones 
                  establecidas en esta política.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Condiciones de la Garantía</h2>
                <ul className="list-disc pl-6 text-gray-600 space-y-3">
                  <li>La garantía de 14 días aplica <strong>únicamente al primer pago</strong> realizado.</li>
                  <li><strong>No aplica</strong> a renovaciones, suscripciones recurrentes ni pagos posteriores.</li>
                  <li><strong>No aplica</strong> a servicios personalizados, configuraciones (setup), consultorías 
                    u otros servicios que hayan sido iniciados o ejecutados.</li>
                  <li>En caso de que el cliente haya solicitado el <strong>inicio inmediato del servicio</strong>,
                    reconoce expresamente que pierde su derecho de desistimiento sobre la parte del servicio ya ejecutada.</li>
                  <li>Nos reservamos el derecho de rechazar solicitudes de reembolso en caso de uso indebido,
                    abuso del servicio o consumo significativo del mismo.</li>
                  <li>La prueba gratuita de 14 días no genera ningún cargo ni da lugar a reembolso, ya que no se realiza ningún cobro durante la misma.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Cancelación</h2>
                <p className="text-gray-600 leading-relaxed">
                  El cliente puede cancelar su suscripción en cualquier momento desde el panel de configuración. 
                  La cancelación evitará futuros cargos, pero <strong>no dará lugar a reembolsos</strong> de 
                  periodos ya iniciados.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Procedimiento</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Para solicitar un reembolso, el cliente deberá seguir estos pasos:
                </p>
                <ol className="list-decimal pl-6 text-gray-600 space-y-2">
                  <li>Contactar con el equipo de soporte dentro del plazo de 14 días naturales desde la compra.</li>
                  <li>Indicar el motivo de la solicitud y proporcionar los datos de la cuenta.</li>
                  <li>Nuestro equipo evaluará la solicitud y responderá en un plazo máximo de 5 días hábiles.</li>
                </ol>
                <div className="mt-6 p-5 bg-amber-50 rounded-xl border border-amber-200">
                  <p className="text-amber-800 text-sm font-medium">
                    ⚠️ En caso de reembolso aprobado, el acceso al servicio será cancelado de forma inmediata.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Contacto para Reembolsos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Si deseas solicitar un reembolso o tienes preguntas sobre esta política, contáctanos:
                </p>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700">
                    <strong>Empresa:</strong> Dimension eXpert LLC<br />
                    <strong>Email:</strong> soporte@volkern.app<br />
                    <strong>Sitio web:</strong> <a href="https://volkern.app" className="text-blue-600 hover:underline">https://volkern.app</a>
                  </p>
                </div>
                <p className="text-gray-600 leading-relaxed mt-4 text-sm">
                  Para más detalle sobre planes, renovación y condiciones comerciales, consulta los{' '}
                  <Link href="/terms" className="text-blue-600 hover:underline">Términos de Servicio</Link>;
                  para el tratamiento de tus datos, la{' '}
                  <Link href="/privacy" className="text-blue-600 hover:underline">Política de Privacidad</Link>.
                </p>
              </section>

            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <Image 
                src="/volkern-logo.png" 
                alt="Volkern CRM" 
                width={120} 
                height={32} 
                className="h-8 w-auto mb-4 brightness-0 invert"
              />
              <p className="text-sm">
                La plataforma todo-en-uno para emprendedores digitales en LATAM.
              </p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Producto</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#features" className="hover:text-white transition">Características</Link></li>
                <li><Link href="/precios" className="hover:text-white transition">Precios</Link></li>
                <li><Link href="/#testimonials" className="hover:text-white transition">Testimonios</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Empresa</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Sobre Nosotros</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Contacto</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/terms" className="hover:text-white transition">Términos de Servicio</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition">Política de Privacidad</Link></li>
                <li><Link href="/reembolsos" className="hover:text-white transition">Política de Reembolsos</Link></li>
                <li><Link href="/verifactu" className="hover:text-white transition font-medium text-amber-400">Veri*Factu</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2024-2026 Volkern CRM. Todos los derechos reservados.</p>
            <p className="mt-2 text-xs text-gray-500">Operado por Dimension eXpert LLC</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

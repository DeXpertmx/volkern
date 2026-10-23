import Link from 'next/link';
import { VERTICAL_PLANS } from '@/lib/vertical-plans';
import { CRM_TIERS } from '@/lib/crm-pricing';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText } from 'lucide-react';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header - Same as main page */}
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
            <FileText className="h-16 w-16 text-white/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Términos de Servicio
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Conoce los términos y condiciones comerciales de uso de nuestra plataforma.
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
                Te damos la bienvenida a Volkern CRM. Al crear una cuenta, iniciar una prueba o utilizar la
                plataforma aceptas estos términos y las condiciones comerciales que se indican a continuación.
                Volkern CRM es operado por <strong>Dimension eXpert LLC</strong>.
              </p>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Descripción del servicio</h2>
                <p className="text-gray-600 leading-relaxed">
                  Volkern CRM es una plataforma de gestión de relaciones con clientes que permite a las empresas
                  gestionar leads, contactos, pipeline, tareas, citas, mensajes, automatizaciones y contenido por
                  verticales (CRM, Marketing, Academia, Contabilidad, RRHH, Inmobiliaria, Industria y Facturación).
                  El servicio incluye integraciones con servicios de terceros como Google Calendar, Google Tasks,
                  WhatsApp y sistemas de correo electrónico.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Cuenta y uso responsable</h2>
                <p className="text-gray-600 leading-relaxed">
                  Debes proporcionar información precisa y completa durante el registro, proteger tus credenciales
                  y notificarnos sobre cualquier uso no autorizado de tu cuenta. Eres responsable de las actividades
                  que ocurran bajo tu cuenta y de contar con las autorizaciones necesarias sobre los datos de tus
                  clientes, contactos, mensajes, documentos y demás contenido que introduzcas en la plataforma.
                  No utilizarás el servicio para enviar comunicaciones no solicitadas (spam), vulnerar la ley,
                  transmitir código malicioso ni interferir con el funcionamiento normal del servicio.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Planes y condiciones comerciales</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Volkern se contrata por verticales. Cada vertical incluye sus módulos específicos más los módulos
                  centrales (leads, contactos, pipeline, tareas, analytics, mensajes y citas). Precios mensuales vigentes:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  {/* Los precios no se escriben aquí: salen de la fuente única
                      (lib/vertical-plans.ts), la misma que usa el cobro. */}
                  {VERTICAL_PLANS.map((v) => (
                    <li key={v.id}>
                      <strong>{v.name}:</strong>{' '}
                      {v.id === 'crm_ventas'
                        ? `${CRM_TIERS.map((t) => `${t.name} ${t.annualMonthly}`).join(', ')} €/usuario/mes (según nivel, facturación anual)`
                        : `${v.price} €/mes`}
                    </li>
                  ))}
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4">
                  Todos los planes incluyen una prueba gratuita de 14 días, sin tarjeta y sin permanencia.
                  Puedes empezar con una vertical y añadir otras desde la configuración sin perder datos ni configuración.
                  Los precios se muestran en euros y los impuestos aplicables se calcularán cuando corresponda.
                  Las funciones, cuotas y precios vigentes se mostrarán claramente antes de confirmar una compra o cambio de plan.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Pagos, renovación y cancelación</h2>
                <p className="text-gray-600 leading-relaxed">
                  Los planes son suscripciones mensuales sin compromiso: se renuevan automáticamente hasta que
                  solicites la cancelación. Puedes cancelar en cualquier momento desde el panel de configuración.
                  La cancelación evita cargos futuros y conserva el acceso hasta el final del periodo ya pagado;
                  no da lugar a reembolsos de periodos ya facturados.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Prueba gratuita y reembolsos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Todos los productos incluyen 14 días de prueba gratuita. Puedes ejercer el derecho de desistimiento
                  y solicitar un reembolso dentro de los 14 días naturales siguientes a la compra, sin perjuicio de
                  los derechos irrenunciables que reconozca la normativa aplicable. La garantía de 14 días aplica
                  únicamente al primer pago realizado.
                </p>
                <p className="text-gray-600 leading-relaxed mt-3">
                  Para solicitar un reembolso, contacta con el equipo de soporte dentro del plazo de 14 días
                  naturales desde la compra indicando el motivo. Evaluaremos la solicitud y responderemos en un
                  plazo máximo de 5 días hábiles. En caso de reembolso aprobado, el acceso al servicio quedará
                  cancelado de forma inmediata. Podemos rechazar solicitudes de reembolso en caso de uso indebido
                  o abuso. Consulta nuestra{' '}
                  <Link href="/reembolsos" className="text-blue-600 hover:underline">Política de Reembolsos</Link>.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Integraciones de terceros</h2>
                <p className="text-gray-600 leading-relaxed">
                  El servicio permite integraciones con servicios de terceros, entre otros Google Calendar
                  (sincronización de citas y eventos), Google Tasks, WhatsApp y servicios de correo electrónico.
                  El uso de estas integraciones está sujeto a los términos de cada proveedor, y el acceso puede
                  revocarse en cualquier momento desde la configuración de integraciones. No somos responsables
                  por el funcionamiento, disponibilidad o cambios de los servicios de terceros.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Cuotas y límites</h2>
                <p className="text-gray-600 leading-relaxed">
                  Cada plan tiene límites de usuarios, módulos, almacenamiento y otras funciones según la oferta
                  vigente. El sistema puede impedir nuevas operaciones al alcanzar una cuota. Te mostraremos los
                  límites aplicables y, cuando esté disponible, avisos de uso antes de llegar a ellos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Soporte</h2>
                <p className="text-gray-600 leading-relaxed">
                  Puedes contactar con nuestro equipo de soporte escribiendo a soporte@volkern.app o a través de
                  los canales publicados en la plataforma. La prioridad y el tiempo de respuesta pueden variar según
                  el plan, la urgencia y la complejidad de la solicitud. No garantizamos atención instantánea ni
                  disponibilidad de soporte fuera de los canales publicados.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Contenido y propiedad intelectual</h2>
                <p className="text-gray-600 leading-relaxed">
                  Conservas tus derechos sobre el contenido y los datos que aportas a la plataforma. Nos concedes
                  únicamente las autorizaciones necesarias para alojarlo, procesarlo y mostrarlo con el fin de
                  prestar el servicio. La plataforma, su código, marca, diseño y componentes son propiedad de
                  Dimension eXpert LLC o de sus licenciantes y están protegidos por la normativa de propiedad
                  intelectual e industrial aplicable.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Disponibilidad y responsabilidad</h2>
                <p className="text-gray-600 leading-relaxed">
                  Trabajamos para mantener el servicio disponible, pero pueden producirse interrupciones por
                  mantenimiento programado, proveedores externos, incidencias de red o causas fuera de nuestro
                  control. En la medida permitida por la ley, Dimension eXpert LLC no será responsable de daños
                  indirectos, incidentales o consecuentes ni de decisiones tomadas exclusivamente con base en la
                  información de la plataforma.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Privacidad y datos personales</h2>
                <p className="text-gray-600 leading-relaxed">
                  El tratamiento de datos personales se describe en nuestra{' '}
                  <Link href="/privacy" className="text-blue-600 hover:underline">Política de Privacidad</Link>,
                  que forma parte integral de estos Términos. Si utilizas la plataforma para gestionar datos de
                  tus clientes, debes informarles y utilizar el servicio conforme a la normativa aplicable,
                  incluyendo el Reglamento General de Protección de Datos cuando corresponda.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Suspensión y terminación</h2>
                <p className="text-gray-600 leading-relaxed">
                  Podemos limitar, suspender o terminar una cuenta cuando exista incumplimiento de estos términos,
                  riesgo para la seguridad, impago o uso ilícito. Cuando sea razonablemente posible, informaremos
                  del motivo y de las vías disponibles para revisarlo. Puedes cancelar tu cuenta en cualquier
                  momento desde la configuración de tu perfil.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Cambios, ley aplicable y contacto</h2>
                <p className="text-gray-600 leading-relaxed">
                  Podemos actualizar estos Términos para reflejar cambios legales, técnicos o comerciales.
                  Publicaremos la versión vigente en esta página y te notificaremos sobre cambios significativos
                  mediante un aviso en la plataforma o por correo electrónico. Estos Términos se rigen por la
                  normativa aplicable, sin perjuicio de los derechos que reconozca la ley de tu país de residencia.
                </p>
                <p className="text-gray-600 leading-relaxed mt-3">
                  Para dudas sobre el servicio o una compra, escribe a soporte@volkern.app; para cuestiones de
                  privacidad, consulta nuestra{' '}
                  <Link href="/privacy" className="text-blue-600 hover:underline">Política de Privacidad</Link>.
                </p>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700">
                    <strong>Empresa:</strong> Dimension eXpert LLC<br />
                    <strong>Email:</strong> soporte@volkern.app<br />
                    <strong>Sitio web:</strong> <a href="https://volkern.app" className="text-blue-600 hover:underline">https://volkern.app</a>
                  </p>
                </div>
              </section>

            </div>
          </div>
        </div>
      </main>

      {/* Footer - Same as main page */}
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
                <li><Link href="/security" className="hover:text-white transition">Política de Seguridad</Link></li>
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

import Link from 'next/link';
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
              <Link href="/#pricing" className="text-gray-600 hover:text-gray-900 transition">Precios</Link>
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
            Conoce los términos y condiciones de uso de nuestra plataforma.
          </p>
          <p className="text-sm text-blue-200 mt-4">Última actualización: 14 de enero de 2026</p>
        </div>
      </section>

      {/* Content */}
      <main className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 md:p-12 space-y-8">
              
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Aceptación de los Términos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Al acceder y utilizar Volkern CRM ("el Servicio"), operado por <strong>Dimension eXpert LLC</strong>, 
                  usted acepta estar sujeto a estos Términos de Servicio. Si no está de acuerdo con alguna parte de 
                  estos términos, no podrá acceder al Servicio.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Descripción del Servicio</h2>
                <p className="text-gray-600 leading-relaxed">
                  Volkern CRM es una plataforma de gestión de relaciones con clientes (CRM) que permite a las empresas 
                  gestionar leads, contactos, citas, automatizaciones de marketing y comunicaciones con clientes. 
                  El Servicio incluye integraciones con servicios de terceros como Google Calendar, WhatsApp y sistemas de correo electrónico.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Registro y Cuenta</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Para utilizar el Servicio, usted debe:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Proporcionar información precisa y completa durante el registro.</li>
                  <li>Mantener la seguridad de su contraseña y cuenta.</li>
                  <li>Notificarnos inmediatamente sobre cualquier uso no autorizado de su cuenta.</li>
                  <li>Ser responsable de todas las actividades que ocurran bajo su cuenta.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Uso Aceptable</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Usted se compromete a no utilizar el Servicio para:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Violar cualquier ley o regulación aplicable.</li>
                  <li>Enviar spam o comunicaciones no solicitadas.</li>
                  <li>Transmitir virus, malware o código malicioso.</li>
                  <li>Intentar acceder a sistemas o datos sin autorización.</li>
                  <li>Interferir con el funcionamiento normal del Servicio.</li>
                  <li>Recopilar datos de otros usuarios sin su consentimiento.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Integraciones de Terceros</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  El Servicio permite integraciones con servicios de terceros, incluyendo pero no limitado a:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>Google Calendar:</strong> Para sincronización de citas y eventos.</li>
                  <li><strong>WhatsApp Business:</strong> Para comunicación con clientes.</li>
                  <li><strong>Servicios de correo electrónico:</strong> Para campañas y notificaciones.</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4">
                  El uso de estas integraciones está sujeto a los términos de servicio de cada proveedor. 
                  No somos responsables por el funcionamiento o disponibilidad de servicios de terceros.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Propiedad Intelectual</h2>
                <p className="text-gray-600 leading-relaxed">
                  El Servicio y su contenido original, características y funcionalidad son propiedad de Dimension eXpert LLC 
                  y están protegidos por derechos de autor, marcas registradas y otras leyes de propiedad intelectual. 
                  Usted conserva todos los derechos sobre los datos que ingresa en el sistema.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Privacidad y Datos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Su privacidad es importante para nosotros. Nuestra recopilación y uso de información personal 
                  se describe en nuestra <Link href="/privacy" className="text-blue-600 hover:underline">Política de Privacidad</Link>, 
                  que forma parte integral de estos Términos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Disponibilidad del Servicio</h2>
                <p className="text-gray-600 leading-relaxed">
                  Nos esforzamos por mantener el Servicio disponible las 24 horas del día, los 7 días de la semana. 
                  Sin embargo, no garantizamos que el Servicio estará disponible de manera ininterrumpida o libre de errores. 
                  Podemos realizar mantenimiento programado con notificación previa cuando sea posible.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Limitación de Responsabilidad</h2>
                <p className="text-gray-600 leading-relaxed">
                  En ningún caso Dimension eXpert LLC, sus directores, empleados o agentes serán responsables por daños indirectos, 
                  incidentales, especiales, consecuentes o punitivos, incluyendo pérdida de beneficios, datos, 
                  uso u otra pérdida intangible, resultante del uso o la imposibilidad de usar el Servicio.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Indemnización</h2>
                <p className="text-gray-600 leading-relaxed">
                  Usted acepta indemnizar y mantener indemne a Dimension eXpert LLC y sus afiliados de cualquier reclamación, 
                  daño, pérdida o gasto (incluyendo honorarios legales razonables) que surja de su uso del Servicio 
                  o su violación de estos Términos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Terminación</h2>
                <p className="text-gray-600 leading-relaxed">
                  Podemos terminar o suspender su acceso al Servicio inmediatamente, sin previo aviso, 
                  por cualquier razón, incluyendo sin limitación si usted incumple estos Términos. 
                  Usted puede cancelar su cuenta en cualquier momento desde la configuración de su perfil.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Modificaciones</h2>
                <p className="text-gray-600 leading-relaxed">
                  Nos reservamos el derecho de modificar estos Términos en cualquier momento. 
                  Le notificaremos sobre cambios materiales mediante un aviso en el Servicio o por correo electrónico. 
                  El uso continuado del Servicio después de dichos cambios constituye su aceptación de los nuevos Términos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Ley Aplicable</h2>
                <p className="text-gray-600 leading-relaxed">
                  Estos Términos se regirán e interpretarán de acuerdo con las leyes aplicables, 
                  sin tener en cuenta sus disposiciones sobre conflictos de leyes.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Contacto</h2>
                <p className="text-gray-600 leading-relaxed">
                  Si tiene preguntas sobre estos Términos de Servicio, puede contactarnos en:
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
                <li><Link href="/#pricing" className="hover:text-white transition">Precios</Link></li>
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

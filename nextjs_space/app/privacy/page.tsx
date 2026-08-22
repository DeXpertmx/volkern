import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
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
            <Shield className="h-16 w-16 text-white/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Política de Privacidad
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Tu privacidad es nuestra prioridad. Conoce cómo protegemos tus datos.
          </p>
          <p className="text-sm text-blue-200 mt-4">Última actualización: 24 de mayo de 2026</p>
        </div>
      </section>

      {/* Content */}
      <main className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 md:p-12 space-y-8">
              
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introducción</h2>
                <p className="text-gray-600 leading-relaxed">
                  Volkern CRM, operado por <strong>Dimension eXpert LLC</strong> ("nosotros", "nuestro" o "la Plataforma"), 
                  se compromete a proteger la privacidad de nuestros usuarios. Esta Política de Privacidad explica cómo 
                  recopilamos, usamos, divulgamos y protegemos su información cuando utiliza nuestra plataforma de gestión 
                  de relaciones con clientes.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Información que Recopilamos</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Recopilamos los siguientes tipos de información:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>Información de cuenta:</strong> Nombre, correo electrónico, contraseña encriptada, y datos de perfil profesional.</li>
                  <li><strong>Datos de contactos y leads:</strong> Información de clientes potenciales que usted ingresa en el sistema.</li>
                  <li><strong>Datos de calendario:</strong> Cuando conecta Google Calendar, accedemos a sus eventos para sincronización bidireccional de citas.</li>
                  <li><strong>Datos de uso:</strong> Información sobre cómo interactúa con nuestra plataforma.</li>
                  <li><strong>Información técnica:</strong> Dirección IP, tipo de navegador, y datos de dispositivo.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Uso de APIs de Google</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Volkern CRM utiliza las siguientes APIs de Google para proporcionar funcionalidades de productividad:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>Google Calendar API:</strong> Accedemos a sus eventos de calendario para mostrarlos en el CRM, crear eventos al agendar citas, y sincronizar cambios bidireccionalmente.</li>
                  <li><strong>Google Tasks API:</strong> Creamos y gestionamos tareas en Google Tasks para mantener sincronizadas sus actividades del CRM.</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4 mb-4">
                  <strong>Uso Limitado:</strong> El uso y la transferencia de la información recibida de las APIs de Google por parte de Volkern CRM se adhiere a la 
                  <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer"> Política de Datos de Usuario de los Servicios de API de Google</a>, 
                  incluyendo los requisitos de <strong>Uso Limitado (Limited Use)</strong>:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Los datos se utilizan exclusivamente para proporcionar y mejorar las funciones visibles para el usuario dentro de la plataforma.</li>
                  <li>No transferimos estos datos a terceros, excepto cuando sea necesario para prestar el servicio (ej. Google Meet).</li>
                  <li>No utilizamos los datos para servir anuncios ni para fines de marketing.</li>
                  <li>No permitimos que personas humanas lean los datos a menos que el usuario haya dado su consentimiento explícito o por razones de seguridad.</li>
                  <li>Puede revocar el acceso en cualquier momento desde la configuración de integraciones.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Cómo Usamos su Información</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Utilizamos la información recopilada para:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Proporcionar y mantener nuestros servicios de CRM.</li>
                  <li>Sincronizar citas con servicios de calendario externos.</li>
                  <li>Enviar notificaciones relacionadas con su cuenta y actividades.</li>
                  <li>Mejorar y personalizar su experiencia en la plataforma.</li>
                  <li>Cumplir con obligaciones legales.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Uso de Inteligencia Artificial</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Volkern CRM utiliza un modelo de inteligencia artificial autohospedado (self-hosted AI model) 
                  para proporcionar funcionalidades avanzadas como análisis predictivo, automatización de procesos, 
                  scoring de leads, generación de contenido y asistencia inteligente.
                </p>
                <p className="text-gray-600 leading-relaxed mb-4">
                  El modelo de IA se ejecuta exclusivamente en nuestra infraestructura, lo que significa que:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>No se comparten datos de usuario</strong> con proveedores externos de IA.</li>
                  <li><strong>Los datos permanecen en nuestros servidores</strong> bajo los mismos estándares de seguridad y encriptación.</li>
                  <li><strong>No utilizamos sus datos</strong> para entrenar o mejorar modelos de terceros.</li>
                  <li>Puede desactivar las funcionalidades de IA en cualquier momento desde la configuración de su cuenta.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Compartir Información</h2>
                <p className="text-gray-600 leading-relaxed">
                  No vendemos, alquilamos ni compartimos su información personal con terceros para fines de marketing. 
                  Podemos compartir información con proveedores de servicios que nos ayudan a operar la plataforma, 
                  siempre bajo estrictos acuerdos de confidencialidad.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Seguridad de Datos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Implementamos medidas de seguridad técnicas y organizativas para proteger su información, incluyendo:
                  encriptación de datos en tránsito y en reposo, autenticación segura, y acceso restringido a datos personales.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Sus Derechos</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Usted tiene derecho a:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Acceder a sus datos personales.</li>
                  <li>Rectificar información incorrecta.</li>
                  <li>Solicitar la eliminación de sus datos.</li>
                  <li>Revocar el acceso a integraciones de terceros.</li>
                  <li>Exportar sus datos en formato legible.</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4">
                  Para solicitudes de eliminación de datos relacionados con integraciones de Meta (Facebook, Instagram, WhatsApp), 
                  puede utilizar nuestro <Link href="/delete-data" className="text-blue-600 hover:underline">formulario de eliminación de datos</Link>.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Retención de Datos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Conservamos su información mientras su cuenta esté activa o según sea necesario para proporcionarle servicios. 
                  Si solicita la eliminación de su cuenta, eliminaremos sus datos personales dentro de 30 días, 
                  excepto cuando la ley requiera su retención.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Cambios a esta Política</h2>
                <p className="text-gray-600 leading-relaxed">
                  Podemos actualizar esta Política de Privacidad periódicamente. Le notificaremos sobre cambios significativos 
                  mediante un aviso en nuestra plataforma o por correo electrónico.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Contacto</h2>
                <p className="text-gray-600 leading-relaxed">
                  Si tiene preguntas sobre esta Política de Privacidad, puede contactarnos en:
                </p>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700">
                    <strong>Empresa:</strong> Dimension eXpert LLC<br />
                    <strong>Email:</strong> privacidad@volkern.app<br />
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

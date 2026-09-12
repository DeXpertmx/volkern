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
          <p className="text-sm text-blue-200 mt-4">Última actualización: 3 de septiembre de 2026 · Versión 2026-09</p>
        </div>
      </section>

      {/* Content */}
      <main className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 md:p-12 space-y-8">

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Responsable y roles</h2>
                <p className="text-gray-600 leading-relaxed">
                  Volkern CRM, operado por <strong>Dimension eXpert LLC</strong> (&quot;nosotros&quot;, &quot;nuestro&quot; o &quot;la Plataforma&quot;),
                  es el responsable del tratamiento de los datos de cuenta, facturación, seguridad y uso de la plataforma.
                  Esta Política de Privacidad explica cómo recopilamos, usamos, divulgamos y protegemos su información
                  cuando utiliza nuestra plataforma de gestión de relaciones con clientes.
                </p>
                <p className="text-gray-600 leading-relaxed mt-3">
                  Cuando una empresa utiliza Volkern CRM para gestionar sus propios datos de contactos, clientes o leads,
                  esa empresa puede actuar como responsable del tratamiento y Volkern CRM como su encargado.
                  La relación concreta de responsable/encargado y los datos de contacto aplicables deben confirmarse
                  en el acuerdo de servicio con el cliente.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Datos que tratamos</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Tratamos los siguientes tipos de datos:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, contraseña encriptada, nombre de usuario y datos de perfil profesional.</li>
                  <li><strong>Contactos y leads:</strong> información de clientes potenciales y contactos que usted ingresa en el sistema.</li>
                  <li><strong>Datos de calendario y citas:</strong> cuando conecta Google Calendar, accedemos a sus eventos para la sincronización bidireccional de citas; cuando usa Google Tasks, gestionamos sus tareas.</li>
                  <li><strong>Documentos y contenido:</strong> archivos, notas y documentos que usted sube o crea en la plataforma.</li>
                  <li><strong>Datos de comunicación:</strong> números de teléfono y contenido de mensajes enviados o recibidos a través de las integraciones de mensajería (WhatsApp, Meta y otras).</li>
                  <li><strong>Datos de uso:</strong> información sobre cómo interactúa con nuestra plataforma.</li>
                  <li><strong>Información técnica:</strong> dirección IP, tipo de navegador, datos de dispositivo, registros de actividad y eventos de seguridad.</li>
                  <li><strong>Registros de consentimiento:</strong> finalidad, versión de la política, fecha, estado de retirada y evidencia técnica.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Finalidades y bases jurídicas</h2>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>Administración de la cuenta y del contrato:</strong> ejecución del contrato de servicio.</li>
                  <li><strong>Citas, tareas y notificaciones:</strong> ejecución del servicio solicitado y, cuando sea necesario, su consentimiento.</li>
                  <li><strong>Funcionalidades de IA y automatización:</strong> ejecución de la funcionalidad solicitada y de las instrucciones del cliente.</li>
                  <li><strong>Seguridad, prevención de fraude y fiabilidad:</strong> interés legítimo, ponderado frente a los derechos de los interesados.</li>
                  <li><strong>Grabaciones u otros tratamientos opcionales:</strong> consentimiento explícito, que puede retirarse en cualquier momento.</li>
                  <li><strong>Obligaciones legales y fiscales:</strong> cumplimiento de la normativa aplicable.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Uso de APIs de Google</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Volkern CRM utiliza las siguientes APIs de Google para proporcionar funcionalidades de productividad:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>Google Calendar API:</strong> accedemos a sus eventos de calendario para mostrarlos en el CRM, crear eventos al agendar citas y sincronizar cambios bidireccionalmente.</li>
                  <li><strong>Google Tasks API:</strong> creamos y gestionamos tareas en Google Tasks para mantener sincronizadas sus actividades del CRM.</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4 mb-4">
                  <strong>Uso Limitado:</strong> el uso y la transferencia de la información recibida de las APIs de Google por parte de Volkern CRM se adhiere a la{' '}
                  <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Política de Datos de Usuario de los Servicios de API de Google</a>,
                  incluyendo los requisitos de <strong>Uso Limitado (Limited Use)</strong>:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Los datos se utilizan exclusivamente para proporcionar y mejorar las funciones visibles para el usuario dentro de la plataforma.</li>
                  <li>No transferimos estos datos a terceros, excepto cuando sea necesario para prestar el servicio (por ejemplo, Google Meet).</li>
                  <li>No utilizamos los datos para servir anuncios ni para fines de marketing.</li>
                  <li>No permitimos que personas humanas lean los datos a menos que el usuario haya dado su consentimiento explícito o por razones de seguridad.</li>
                  <li>Puede revocar el acceso en cualquier momento desde la configuración de integraciones.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Uso de inteligencia artificial</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Volkern CRM ofrece funcionalidades de inteligencia artificial para proporcionar análisis, automatización
                  de procesos, generación de contenido y asistencia inteligente dentro de la plataforma.
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Los datos se utilizan exclusivamente para proporcionar y mejorar las funciones solicitadas por el usuario.</li>
                  <li>No vendemos ni compartimos los datos de usuario con terceros para fines ajenos a la prestación del servicio.</li>
                  <li>No utilizamos sus datos para entrenar o mejorar modelos de terceros.</li>
                  <li>Puede desactivar las funcionalidades de IA en cualquier momento desde la configuración de su cuenta.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Encargados y proveedores de servicios</h2>
                <p className="text-gray-600 leading-relaxed mb-3">
                  Utilizamos los siguientes proveedores para las finalidades indicadas. La región exacta y las garantías
                  contractuales aplicables deben confirmarse en los acuerdos de tratamiento de datos vigentes y en los
                  términos de cada proveedor antes de confiar en ellos para un cliente concreto.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 pr-4">Proveedor</th>
                        <th className="py-2 pr-4">Finalidad</th>
                        <th className="py-2">Ubicación / nota de transferencia</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Vercel</td><td className="py-2 pr-4">Alojamiento, funciones sin servidor y despliegue</td><td className="py-2">La región depende de la configuración del proyecto; verificar DPA y mecanismo de transferencia.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Amazon Web Services (AWS)</td><td className="py-2 pr-4">Almacenamiento de documentos (S3) y envío de correo (SES)</td><td className="py-2">Puede implicar tratamiento fuera del EEE; verificar DPA y salvaguardas aplicables.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">PostgreSQL</td><td className="py-2 pr-4">Base de datos principal de la aplicación</td><td className="py-2">Verificar la ubicación de la instancia en producción y las salvaguardas de transferencia.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Stripe</td><td className="py-2 pr-4">Pagos, suscripciones y portal de facturación</td><td className="py-2">El procesamiento de pagos y las salvaguardas internacionales se rigen por los términos/DPA de Stripe.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Google</td><td className="py-2 pr-4">Inicio de sesión, calendario y tareas</td><td className="py-2">El tratamiento se rige por los términos de Google y las salvaguardas aplicables.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Meta / WhatsApp</td><td className="py-2 pr-4">Integraciones de mensajería y redes sociales</td><td className="py-2">La infraestructura del proveedor está fuera de la aplicación; verificar DPA, ubicación y salvaguardas.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Proveedores de notificaciones</td><td className="py-2 pr-4">Notificaciones push y avisos</td><td className="py-2">Puede implicar tratamiento internacional; regido por el DPA del proveedor aplicable.</td></tr>
                      <tr><td className="py-2 pr-4 font-medium">Proveedores de modelos de IA</td><td className="py-2 pr-4">Funcionalidades de IA cuando están habilitadas</td><td className="py-2">Puede implicar tratamiento fuera del EEE; verificar DPA y salvaguarda aplicable antes de su uso.</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Transferencias internacionales</h2>
                <p className="text-gray-600 leading-relaxed">
                  Algunos proveedores pueden tratar datos fuera del Espacio Económico Europeo. Cuando una transferencia
                  no esté cubierta por una decisión de adecuación, debe ampararse en una salvaguarda apropiada, como las
                  Cláusulas Contractuales Tipo de la UE, junto con una evaluación de impacto de la transferencia cuando
                  sea necesaria. No representamos que una transferencia internacional sea lícita únicamente porque un
                  proveedor figure en esta lista: el responsable debe verificar y mantener el DPA y las salvaguardas aplicables.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Retención de datos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Conservamos su información mientras su cuenta esté activa o según sea necesario para prestarle el
                  servicio. Si solicita la eliminación de su cuenta, eliminaremos sus datos personales en un plazo máximo
                  de 30 días, excepto cuando la ley o una instrucción documentada del cliente exija su conservación.
                  Los datos operativos se eliminan conforme a la política de retención configurada y los registros de
                  consentimiento se conservan durante el periodo exigido por la normativa aplicable.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Sus derechos conforme al RGPD</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Con arreglo a la normativa aplicable, usted tiene derecho a:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Acceder a sus datos personales.</li>
                  <li>Rectificar información incorrecta.</li>
                  <li>Solicitar la eliminación de sus datos.</li>
                  <li>Solicitar la limitación u oposición al tratamiento.</li>
                  <li>Revocar el acceso a integraciones de terceros.</li>
                  <li>Exportar sus datos en formato legible (portabilidad).</li>
                  <li>Retirar en cualquier momento el consentimiento prestado.</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4">
                  Los usuarios autenticados pueden descargar sus datos desde el panel Privacidad GDPR (Cumplimiento
                  → Privacidad GDPR) y solicitar la anonimización de su información personal en los registros de
                  auditoría. Para solicitar la eliminación de su cuenta o ejercer cualquier otro derecho, escríbanos
                  al correo de contacto indicado al final de esta página. Para solicitudes de eliminación de datos
                  relacionadas con integraciones de Meta
                  (Facebook, Instagram, WhatsApp), puede utilizar nuestro{' '}
                  <Link href="/delete-data" className="text-blue-600 hover:underline">formulario de eliminación de datos</Link>.
                  También puede presentar una reclamación ante su autoridad de control local.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Seguridad de datos</h2>
                <p className="text-gray-600 leading-relaxed">
                  Implementamos medidas de seguridad técnicas y organizativas para proteger su información, incluyendo
                  encriptación de datos en tránsito y en reposo, autenticación segura, controles de acceso y acceso
                  restringido a los datos personales. Ningún servicio en línea puede garantizar una seguridad absoluta.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Cambios a esta política</h2>
                <p className="text-gray-600 leading-relaxed">
                  Podemos actualizar esta Política de Privacidad periódicamente. Le notificaremos sobre cambios
                  significativos mediante un aviso en nuestra plataforma o por correo electrónico.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contacto</h2>
                <p className="text-gray-600 leading-relaxed">
                  Si tiene preguntas sobre esta Política de Privacidad o desea ejercer sus derechos, puede contactarnos en:
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

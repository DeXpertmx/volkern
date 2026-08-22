import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldAlert } from 'lucide-react';

export default function SecurityPolicyPage() {
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
            <ShieldAlert className="h-16 w-16 text-white/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Política de Seguridad
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Cómo reportar vulnerabilidades de seguridad de forma responsable.
          </p>
          <p className="text-sm text-blue-200 mt-4">Última actualización: 22 de agosto de 2026</p>
        </div>
      </section>

      {/* Content */}
      <main className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 md:p-12 space-y-8">

              <section className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-3">Reportar una vulnerabilidad</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Valoramos el trabajo de la comunidad de investigadores de seguridad. Si has encontrado una
                  vulnerabilidad en Volkern CRM, te pedimos que la reportes de forma responsable:
                </p>
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  <p className="text-gray-700">
                    <strong>Email de seguridad:</strong>{' '}
                    <a href="mailto:security@dimensionexpert.com" className="text-blue-600 hover:underline">security@dimensionexpert.com</a>
                    <br />
                    <strong>Archivo de contacto:</strong>{' '}
                    <a href="/.well-known/security.txt" className="text-blue-600 hover:underline">/.well-known/security.txt</a>
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Qué esperamos de ti</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Antes de reportar, por favor:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Revisa que el problema no sea ya conocido o un comportamiento documentado.</li>
                  <li>Incluye pasos de reproducción claros, capturas de pantalla y detalles del entorno (navegador, versión, URL).</li>
                  <li>Indica el impacto estimado de la vulnerabilidad.</li>
                  <li>No accedas a más datos de los necesarios para demostrar la vulnerabilidad. Si accedes a datos de otros usuarios, detente e inclúyelo en tu reporte sin difundirlo.</li>
                  <li>No explotes la vulnerabilidad más allá de lo necesario para demostrarla.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Alcance</h2>
                <p className="text-gray-600 leading-relaxed mb-4">Están dentro de alcance las siguientes superficies:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>El dominio <strong>volkern.app</strong> y sus subdominios.</li>
                  <li>El dominio <strong>erp.dimension.expert</strong> y sus subdominios.</li>
                  <li>Las APIs públicas y endpoints documentados.</li>
                  <li>Los portales públicos (cotizaciones, firmas, formularios, booking).</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4 mb-4">Están <strong>fuera de alcance</strong>:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Ataques de denegación de servicio (DoS/DDoS) masivos.</li>
                  <li>Ingeniería social, phishing o suplantación de identidad.</li>
                  <li>Vulnerabilidades en servicios de terceros que Volkern utiliza como infraestructura (Cloudflare, Contabo, proveedores de correo), salvo que afecten directamente a nuestros servicios.</li>
                  <li>Spam, fuerza bruta de credenciales o pruebas que degraden el servicio.</li>
                  <li>Hallazgos en dispositivos personales de empleados o clientes.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Qué esperar de nosotros</h2>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li><strong>Acuse de recibo:</strong> Confirmaremos la recepción de tu reporte en un plazo de 5 días hábiles.</li>
                  <li><strong>Evaluación:</strong> Validaremos la vulnerabilidad y determinaremos su severidad.</li>
                  <li><strong>Corrección:</strong> Trabajaremos en una corrección según la severidad. Las vulnerabilidades críticas se priorizan de inmediato.</li>
                  <li><strong>Comunicación:</strong> Te mantendremos informado del progreso y del plan de divulgación.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Divulgación coordinada</h2>
                <p className="text-gray-600 leading-relaxed">
                  Te pedimos una divulgación coordinada: una vez corregida la vulnerabilidad, daremos un plazo
                  razonable (habitualmente 30 días) antes de la divulgación pública. Solicitamos no publicar
                  detalles de la vulnerabilidad hasta que hayamos aplicado la corrección y lo hayamos acordado contigo.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Buena fe y protección legal</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Si realizas pruebas de seguridad de buena fe, dentro de este alcance y siguiendo esta política,
                  no tomaremos acciones legales contra ti. Consideramos buena fe:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Actuar sin ánimo de lucro ni daño a los usuarios o al servicio.</li>
                  <li>Reportar la vulnerabilidad a <strong>security@dimensionexpert.com</strong> antes de cualquier divulgación pública.</li>
                  <li>No acceder, modificar o eliminar datos que no te pertenezcan.</li>
                  <li>Detener las pruebas ante la primera señal de impacto en producción.</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-4">
                  Esta protección aplica solo a las actividades de prueba dentro del alcance definido en esta política.
                  Las actividades fuera de alcance o malintencionadas no están cubiertas.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Reconocimiento</h2>
                <p className="text-gray-600 leading-relaxed">
                  Actualmente no ofrecemos un programa formal de recompensas (bug bounty) por el descubrimiento de
                  vulnerabilidades. Sin embargo, reconocemos públicamente a los investigadores que reportan de buena
                  fe vulnerabilidades válidas, salvo que prefieran permanecer en el anonimato.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Cifrado de comunicaciones</h2>
                <p className="text-gray-600 leading-relaxed">
                  Si necesitas enviar información sensible como parte de tu reporte, podemos proporcionarte una
                  clave PGP para cifrar la comunicación. Solicítala por correo a{' '}
                  <a href="mailto:security@dimensionexpert.com" className="text-blue-600 hover:underline">security@dimensionexpert.com</a>.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Contacto</h2>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700">
                    <strong>Email de seguridad:</strong>{' '}
                    <a href="mailto:security@dimensionexpert.com" className="text-blue-600 hover:underline">security@dimensionexpert.com</a>
                    <br />
                    <strong>Empresa:</strong> Dimension eXpert LLC<br />
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

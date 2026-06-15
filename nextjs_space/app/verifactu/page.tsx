import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileCheck, Shield, Download } from 'lucide-react';

export default function VerifactuPage() {
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
            <FileCheck className="h-16 w-16 text-white/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Veri*Factu — Declaración Responsable
          </h1>
          <p className="text-xl text-blue-100 max-w-3xl mx-auto">
            Sistema Informático de Facturación (SIF) — Cumplimiento normativo con la Agencia Tributaria Española.
          </p>
          <p className="text-sm text-blue-200 mt-4">
            Código: VOLKERN-SIF-2026-001 | Versión: 1.0.0 | Fecha: 14/05/2026
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <a 
              href="/docs/DECLARACION-RESPONSABLE-VOLKERN.pdf" 
              target="_blank"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition backdrop-blur-sm"
            >
              <Download className="h-5 w-5" />
              Descargar PDF
            </a>
            <a 
              href="/docs/INFORME-CUMPLIMIENTO-VERIFACTU.pdf" 
              target="_blank"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition backdrop-blur-sm"
            >
              <Download className="h-5 w-5" />
              Informe de Cumplimiento
            </a>
          </div>
        </div>
      </section>

      {/* Content */}
      <main className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 md:p-12 space-y-8">

              {/* Box: Declaración */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h2 className="text-xl font-bold text-blue-900 mb-3">Declaración</h2>
                <p className="text-blue-800 leading-relaxed text-sm">
                  En cumplimiento de lo dispuesto en la Orden Ministerial HAC/1177/2024, aprobada por el Real Decreto 1007/2023,
                  <strong> Dimension Expert LLC</strong> declara que se hace responsable como entidad productora del Sistema Informático
                  de Facturación (SIF) Volkern, del cumplimiento con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003,
                  de 17 de diciembre, General Tributaria.
                </p>
              </div>

              {/* 1. Descripción del Sistema */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Descripción del Sistema Informático de Facturación</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  El sistema informático <strong>Volkern</strong> consta de un componente software (aplicación web SaaS) y no requiere
                  hardware específico por parte del usuario, funcionando íntegramente en la nube.
                </p>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Este SIF está diseñado como una plataforma integral de gestión empresarial en la nube que optimiza los procesos de
                  gestión de clientes (CRM), ventas, servicios, proyectos, facturación y contabilidad. Está especialmente concebida
                  para pequeñas y medianas empresas (PYMES), agencias, consultoras y negocios del sector servicios que requieran un
                  sistema de facturación conforme a la normativa española.
                </p>
                <p className="text-gray-600 leading-relaxed">
                  Entre sus distintas funcionalidades, Volkern permite la generación y remisión de registros de facturación a la
                  Agencia Tributaria incorporando los requisitos legales y las especificaciones técnicas establecidas para los
                  sistemas informáticos que intervienen en procesos de facturación, garantizando la trazabilidad, integridad y
                  autenticidad de los registros conforme a la normativa aplicable.
                </p>
              </section>

              {/* 2. Operativa en modo VERI*FACTU */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Operativa en modo «VERI*FACTU»</h2>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-4">
                  <h3 className="font-bold text-amber-900 mb-2">Declaración de Modalidad de Uso</h3>
                  <p className="text-amber-800 leading-relaxed text-sm">
                    Volkern en la versión identificada (1.0.0) permite su utilización por parte de múltiples obligados tributarios,
                    los cuales son gestionados e identificados de forma individual dentro del sistema, asegurando el encadenamiento
                    de los registros de facturación conforme a lo establecido en el Real Decreto 1007/2023.
                  </p>
                </div>
                <p className="text-gray-600 leading-relaxed">
                  La versión arriba descrita del software <strong>Volkern</strong> permite operar a sus usuarios exclusivamente en
                  el marco del sistema <strong>«VERI*FACTU»</strong>, implementando las siguientes funcionalidades de cumplimiento:
                </p>
              </section>

              {/* 3. Funcionalidades - Tabla */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Funcionalidades de Cumplimiento</h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left p-4 font-semibold text-gray-700">Funcionalidad</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Descripción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        { func: 'Generación de facturas', desc: 'Emisión de facturas completas con todos los campos obligatorios según normativa, incluyendo numeración correlativa y datos del emisor/receptor.' },
                        { func: 'Libro registro de facturas', desc: 'Registro cronológico e inmutable de todas las facturas emitidas y recibidas, con sellado de tiempo cualificado RFC 3161.' },
                        { func: 'Validación de esquemas', desc: 'Verificación de formato XML/XSD conforme a las especificaciones de la AEAT para Verifactu.' },
                        { func: 'Encadenamiento de registros', desc: 'Cada factura se enlaza criptográficamente con la anterior mediante hash SHA-256, formando una cadena de integridad inalterable.' },
                        { func: 'Sellado de tiempo', desc: 'Timestamp cualificado según RFC 3161 para cada registro de facturación, garantizando la prueba de existencia.' },
                        { func: 'Remisión a AEAT', desc: 'Transmisión directa de los registros de facturación a los servicios web de la Agencia Tributaria.' },
                        { func: 'Gestión multi-tenant', desc: 'Aislamiento completo de datos entre distintos obligados tributarios dentro de la misma instancia del sistema.' },
                      ].map((item, i) => (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 font-medium text-gray-800">{item.func}</td>
                          <td className="p-4 text-gray-600 text-sm">{item.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 4. Firmas Electrónicas */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Firmas Electrónicas Avanzadas (Voluntarias)</h2>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
                  <p className="text-indigo-800 leading-relaxed text-sm">
                    <strong>IMPORTANTE:</strong> A pesar de no constituir un requisito obligatorio para los sistemas operativos
                    en modo «VERI*FACTU», el sistema informático Volkern implementa, de forma adicional y voluntaria, la
                    incorporación de una <strong>firma electrónica avanzada conforme al estándar XAdES</strong> en cada registro
                    de facturación, reforzando así las garantías de integridad, autenticidad y trazabilidad de los datos generados,
                    en línea con los principios de fiabilidad tecnológica exigidos por la normativa vigente.
                  </p>
                </div>
              </section>

              {/* 5. Datos de la Entidad */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Datos de la Entidad Productora</h2>
                <div className="bg-gray-50 rounded-xl p-6 space-y-3">
                  {[
                    ['Razón Social', 'Dimension Expert LLC'],
                    ['Nombre Comercial', 'Volkern'],
                    ['Tax ID / EIN', '35-2823149'],
                    ['Domicilio', 'Anillo Fray Junipero Serra 9200 Piso 7'],
                    ['Actividad', 'Desarrollo de SAAS e Inteligencia Artificial'],
                    ['Versión del Sistema', '1.0.0'],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:gap-4">
                      <span className="font-semibold text-gray-700 min-w-[180px]">{label}:</span>
                      <span className="text-gray-600">{value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 6. Declaración de Cumplimiento */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Declaración de Cumplimiento</h2>
                <div className="border border-green-200 bg-green-50 rounded-xl p-6">
                  <p className="text-green-800 leading-relaxed text-sm mb-4">
                    La entidad productora del sistema informático, con razón social <strong>Dimension Expert LLC</strong>,
                    nombre comercial <strong>Volkern</strong>, Tax ID <strong>35-2823149</strong>, formula la presente
                    Declaración Responsable, bajo su responsabilidad, manifestando que Volkern en su versión 1.0.0 cumple
                    con lo establecido en:
                  </p>
                  <ul className="list-disc pl-6 text-green-700 text-sm space-y-2">
                    <li>El artículo 29.2.j) de la <strong>Ley 58/2003</strong>, de 17 de diciembre, General Tributaria.</li>
                    <li>El <strong>Real Decreto 1007/2023</strong>, de 5 de diciembre, por el que se aprueba el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales.</li>
                    <li>La <strong>Orden HAC/1177/2024</strong>, de 17 de octubre, por la que se desarrollan las especificaciones técnicas y funcionales del Sistema de Facturación Verifactu.</li>
                    <li>Las especificaciones adicionales publicadas en la sede electrónica de la <strong>Agencia Estatal de Administración Tributaria (AEAT)</strong>.</li>
                  </ul>
                </div>
              </section>

              {/* 7. Compromiso */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Compromiso de Mantenimiento</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Dimension Expert LLC se compromete a:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-2">
                  <li>Mantener actualizado el sistema Volkern conforme a las modificaciones normativas que publique la AEAT.</li>
                  <li>Comunicar cualquier actualización o nueva versión que implique cambio en las especificaciones técnicas de Verifactu.</li>
                  <li>Conservar la documentación técnica que permita auditar el cumplimiento del sistema durante el período legalmente establecido.</li>
                  <li>Colaborar con las autoridades competentes en caso de requerimiento de información o auditoría.</li>
                </ul>
              </section>

              {/* Firma */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Firma Electrónica</h2>
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-green-100 rounded-full p-3 mt-1">
                      <Shield className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-gray-700 font-semibold">Firmado electrónicamente por:</p>
                      <div className="mt-2 space-y-1 text-gray-600 text-sm">
                        <p><span className="font-medium">Entidad:</span> Dimension Expert LLC</p>
                        <p><span className="font-medium">Rol:</span> Representante Legal</p>
                        <p><span className="font-medium">Nombre:</span> Bruno Konstantin Hess Gómez Tagle</p>
                        <p><span className="font-medium">NIE:</span> Z4090988Y</p>
                        <p><span className="font-medium">Fecha:</span> 14 de mayo de 2026</p>
                        <p><span className="font-medium">Lugar:</span> Sede electrónica (Internet)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Documentos relacionados */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Documentos Relacionados</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <a 
                    href="/docs/DECLARACION-RESPONSABLE-VOLKERN.pdf" 
                    target="_blank"
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition group"
                  >
                    <div className="bg-blue-100 rounded-lg p-3 group-hover:bg-blue-200 transition">
                      <Download className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Declaración Responsable</p>
                      <p className="text-sm text-gray-500">PDF — VOLKERN-SIF-2026-001</p>
                    </div>
                  </a>
                  <a 
                    href="/docs/INFORME-CUMPLIMIENTO-VERIFACTU.pdf" 
                    target="_blank"
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition group"
                  >
                    <div className="bg-green-100 rounded-lg p-3 group-hover:bg-green-200 transition">
                      <Download className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Informe de Cumplimiento</p>
                      <p className="text-sm text-gray-500">PDF — Auditoría técnica Veri*Factu</p>
                    </div>
                  </a>
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

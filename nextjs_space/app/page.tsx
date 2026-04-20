
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Zap, Users, TrendingUp, MessageSquare, Award, ArrowRight, Star, Shield, Sparkles, BarChart3, Mail, Calendar, CheckCircle2, LayoutTemplate } from 'lucide-react'
import { prisma } from '@/lib/db'
import { PublicPageRenderer } from '@/components/public-page-renderer'

import { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const dynamicPage = await prisma.page.findFirst({
      where: { slug: 'home', estado: 'published', tenantId: null },
      select: { titulo: true, metaTitulo: true, metaDescripcion: true, metaImagen: true }
    });

    if (dynamicPage) {
      return {
        title: dynamicPage.metaTitulo || dynamicPage.titulo || 'Volkern CRM',
        description: dynamicPage.metaDescripcion || undefined,
        openGraph: dynamicPage.metaImagen ? { images: [dynamicPage.metaImagen] } : undefined
      };
    }
  } catch (err) {
    console.error('Error generating metadata:', err);
  }
  return { title: 'Volkern CRM' };
}

export default async function LandingPage() {
  // Check if a dynamic "home" page has been built and published via Page Builder
  let dynamicPage = null
  try {
    dynamicPage = await prisma.page.findFirst({
      where: {
        slug: 'home',
        estado: 'published',
        tenantId: null,
      },
      select: {
        id: true,
        titulo: true,
        metaTitulo: true,
        metaDescripcion: true,
        metaImagen: true,
        contenido: true,
        cssPersonalizado: true,
        tenantId: true,
      }
    })

    if (dynamicPage) {
      // Increment views
      await prisma.page.update({
        where: { id: dynamicPage.id },
        data: {
          vistas: { increment: 1 }
        }
      }).catch(console.error)
    }
  } catch (error) {
    console.error('Error fetching dynamic homepage:', error)
  }

  // Safely parse Json content
  let isGrapesjs = false;
  let htmlContent = '';
  let pageComponents = null;
  let contenido: any = null;

  if (dynamicPage && dynamicPage.contenido) {
    contenido = dynamicPage.contenido as any;
    if (contenido.format === 'grapesjs') {
      isGrapesjs = true;
      htmlContent = contenido.html || '';
    } else {
      pageComponents = contenido?.components || null;
    }
  }

  // Si existe una página dinámica configurada (ya sea global o tenant)
  if (dynamicPage && (isGrapesjs || pageComponents)) {
    // Reparar CSS para que las clases de GrapesJS que aplican al body se apliquen a nuestro contenedor
    let scopedCss = '';
    if (isGrapesjs && dynamicPage.cssPersonalizado) {
      scopedCss = dynamicPage.cssPersonalizado
        .replace(/\bbody\b/g, '.grapesjs-compiled-content')
        .replace(/\.zephyr-wrapper\b/g, '.grapesjs-compiled-content');
    }

    if (isGrapesjs && htmlContent) {
      // Si el HTML contiene etiquetas <style> internas (común en exportaciones parciales), 
      // también las sanitizamos para que no fuercen el fondo blanco del body real.
      htmlContent = htmlContent.replace(/<style>([\s\S]*?)<\/style>/gi, (match, css) => {
        const sanitized = css
          .replace(/\bbody\b/g, '.grapesjs-compiled-content')
          .replace(/\.zephyr-wrapper\b/g, '.grapesjs-compiled-content');
        return `<style>${sanitized}</style>`;
      });
    }

    return (
      <div suppressHydrationWarning className="w-full min-h-screen grapesjs-compiled-content">
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.1/dist/tailwind.min.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet" />
        {isGrapesjs ? (
          <>
            {scopedCss && (
              <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
            )}
            <div 
              suppressHydrationWarning 
              dangerouslySetInnerHTML={{ __html: htmlContent }} 
              id="grapesjs-root"
            />
            <script 
              dangerouslySetInnerHTML={{ 
                __html: `
                  (function() {
                    var root = document.getElementById('grapesjs-root');
                    if (!root) return;
                    var scripts = root.querySelectorAll('script');
                    scripts.forEach(function(oldScript) {
                      var newScript = document.createElement('script');
                      Array.from(oldScript.attributes).forEach(function(attr) {
                        newScript.setAttribute(attr.name, attr.value);
                      });
                      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                      oldScript.parentNode.replaceChild(newScript, oldScript);
                    });
                  })();
                ` 
              }} 
            />
          </>
        ) : (
          <PublicPageRenderer
            projectData={contenido.projectData || null}
            html={contenido.html || null}
            css={contenido.css || null}
          />
        )}
      </div>
    )
  }

  // FALLBACK: si no hay página dinámica "home", muestra la landing comercial clásica
  // Obtener planes reales de la base de datos
  const dbPlans = await prisma.subscriptionPlan.findMany({
    where: { 
      activo: true,
      esPublico: true 
    },
    orderBy: { precio: 'asc' }
  });

  const plans = dbPlans.map(plan => {
    // Extraer características de la UI desde el JSON features
    const features = (plan.features as any)?.ui_features || [];
    
    // Si no hay características definidas, usar algunas por defecto basadas en límites
    const displayFeatures = features.length > 0 ? features : [
      `${plan.limiteUsuarios === -1 ? 'Usuarios ilimitados' : 'Hasta ' + plan.limiteUsuarios + ' usuarios'}`,
      `${plan.limiteLeads === -1 ? 'Leads ilimitados' : 'Hasta ' + plan.limiteLeads + ' leads'}`,
      `${plan.limiteStorage} GB de almacenamiento`,
      plan.whitelabelHabilitado ? 'Marca Blanca incluida' : '',
      plan.dominioPersonalizadoHabilitado ? 'Dominio personalizado' : ''
    ].filter(Boolean);

    return {
      name: plan.nombre,
      price: `${plan.precio}${plan.moneda === 'MXN' ? '$' : '€'}`,
      period: `/${plan.intervalo === 'mensual' ? 'mes' : 'año'}`,
      description: plan.descripcion || 'Plan de servicio profesional.',
      features: displayFeatures,
      cta: plan.precio === 0 ? 'Empezar Gratis' : 'Elegir Plan',
      popular: plan.esPopular, // Usar campo dinámico de la DB
      slug: plan.slug
    };
  });

  const features = [
    {
      icon: BarChart3,
      title: 'Dashboards Dinámicos',
      description: 'Widgets personalizables tipo Drag & Drop. Monitorea comisiones, cierres de ventas y engagement de estudiantes en tu tablero ideal.'
    },
    {
      icon: Zap,
      title: 'Automatizaciones Visuales',
      description: 'Constructor de nodos inteligente. Orquesta flujos de WhatsApp, correos de bienvenida y recordatorios de pago sin usar código.'
    },
    {
      icon: LayoutTemplate,
      title: 'Constructor Drag & Drop',
      description: 'Page Builder Pixel-Perfect para diseñar landing pages, embudos y personalizar por completo la web raíz (¡incluso esta misma página!).'
    },
    {
      icon: Award,
      title: 'Academia Gamificada (LMS)',
      description: 'Publica cursos con entrega progresiva (drip content), seguimiento de progreso, mini-foros por cohortes y cobros integrados.'
    },
    {
      icon: CheckCircle2,
      title: 'Tarjetas Digitales NFC',
      description: 'Multiplica tu networking presencial. Crea tarjetas mobile-first editables con QR interactivo compatibles con hardware NFC.'
    },
    {
      icon: MessageSquare,
      title: 'CRM Multi-Canal',
      description: 'Pipeline de ventas visual, bandeja de entrada unificada en tiempo real para gestionar todos tus leads sin recargas constantes.'
    },
    {
      icon: Shield,
      title: 'Arquitectura Enterprise',
      description: 'Estructura lista para crecimiento con procesos en segundo plano (Webhooks) garantizando la velocidad sin importar tu volumen de ventas.'
    }
  ]

  const testimonials = [
    {
      name: 'María González',
      role: 'CEO, EduTech México',
      content: 'Volkern transformó nuestra operación. Pasamos de gestionar leads en Excel a tener todo automatizado. Nuestras ventas aumentaron 40% en 3 meses.',
      rating: 5
    },
    {
      name: 'Carlos Rodríguez',
      role: 'Director de Marketing, InnovaCoach',
      content: 'La mejor inversión que hemos hecho. La plataforma de cursos integrada nos permite vender formación sin necesitar herramientas adicionales.',
      rating: 5
    },
    {
      name: 'Ana Martínez',
      role: 'Fundadora, Agencia Digital',
      content: 'Antes usábamos 5 herramientas diferentes. Volkern consolidó todo en una sola plataforma. Ahorramos tiempo y dinero todos los meses.',
      rating: 5
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <Image
              src="/volkern-logo.png"
              alt="Volkern CRM Logo"
              width={150}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </div>
          <nav className="hidden md:flex space-x-8 items-center">
            <a href="#features" className="text-gray-600 hover:text-[#1a3e6e] transition font-medium">Características</a>
            <a href="#testimonials" className="text-gray-600 hover:text-[#1a3e6e] transition font-medium">Testimonios</a>
            <a href="#pricing" className="text-gray-600 hover:text-[#1a3e6e] transition font-medium">Precios</a>
            <Link href="/auth/login" className="text-gray-600 hover:text-[#1a3e6e] transition font-medium">Iniciar Sesión</Link>
            <Link href="/signup">
              <Button className="bg-[#1a3e6e] hover:bg-[#152f54] shadow-lg">
                Prueba Gratis 14 Días
              </Button>
            </Link>
          </nav>
          <Link href="/signup" className="md:hidden">
            <Button size="sm" className="bg-[#1a3e6e] hover:bg-[#152f54]">Prueba Gratis</Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="text-center max-w-5xl mx-auto">
          <div className="inline-flex items-center space-x-2 bg-blue-50 text-[#1a3e6e] px-4 py-2 rounded-full mb-6">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold">El Hub Operativo B2B de Nueva Generación</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            Centraliza Operaciones,<br />
            <span className="text-[#1a3e6e]">Multiplica en Escala</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Desde la gestión de leads hasta la impartición de cursos y automatizaciones avanzadas.
            <span className="font-semibold text-gray-900"> El único ecosistema que tu negocio necesita.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Link href="/signup">
              <Button size="lg" className="bg-[#1a3e6e] hover:bg-[#152f54] text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-all">
                Empieza Gratis 14 Días
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <p className="text-sm text-gray-500">
              <CheckCircle2 className="inline h-4 w-4 text-green-500 mr-1" />
              Sin tarjeta de crédito • Configuración en 2 minutos
            </p>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-green-500" />
              <span>Datos seguros</span>
            </div>
            <div className="flex items-center space-x-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <span>4.9/5 valoración</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-500" />
              <span>+500 empresas confían</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Todo lo que necesitas para <span className="text-[#1a3e6e]">crecer</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Una plataforma completa diseñada para emprendedores, coaches y agencias en LATAM
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-[#1a3e6e] hover:shadow-xl transition-all duration-300">
                <CardHeader>
                  <div className="h-12 w-12 bg-gradient-to-br from-[#1a3e6e] to-[#2d5a8e] rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 md:py-32 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Lo que dicen nuestros <span className="text-[#1a3e6e]">clientes</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Historias reales de emprendedores que transformaron su negocio con Volkern
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-white shadow-lg hover:shadow-2xl transition-all">
                <CardHeader>
                  <div className="flex space-x-1 mb-3">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <CardDescription className="text-base text-gray-700 leading-relaxed">
                    "{testimonial.content}"
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container mx-auto px-4 py-20 md:py-32">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Precios <span className="text-[#1a3e6e]">transparentes</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Todos los planes incluyen 14 días de prueba gratis. Sin permanencia, cancela cuando quieras.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card
              key={index}
              className={`relative ${plan.popular
                ? 'border-[#1a3e6e] border-2 shadow-2xl scale-105'
                : 'border-gray-200'
                } hover:shadow-xl transition-all duration-300`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <span className="bg-gradient-to-r from-[#1a3e6e] to-[#2d5a8e] text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Más Popular
                  </span>
                </div>
              )}

              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                <CardDescription className="text-gray-600 mb-6">
                  {plan.description}
                </CardDescription>
                <div className="mb-6">
                  <span className="text-5xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500">{plan.period}</span>
                </div>
                <Link href="/signup">
                  <Button
                    className={`w-full ${plan.popular
                      ? 'bg-[#1a3e6e] hover:bg-[#152f54] text-white shadow-lg'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                      }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3">
                  {plan.features.map((feature: string, featureIndex: number) => (
                    <li key={featureIndex} className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-gray-500 mt-12">
          Todos los precios en USD. Acepta pagos con tarjeta, PayPal y transferencia.
        </p>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-[#1a3e6e] to-[#2d5a8e] py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            ¿Listo para transformar tu negocio?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Únete a cientos de emprendedores que ya están creciendo con Volkern CRM
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="bg-white text-[#1a3e6e] hover:bg-gray-100 text-lg px-8 py-6 shadow-xl">
              Empieza tu prueba gratuita
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="text-blue-100 text-sm mt-4">
            14 días gratis • Sin tarjeta • Cancela cuando quieras
          </p>
        </div>
      </section>

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
                <li><a href="#features" className="hover:text-white transition">Características</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Precios</a></li>
                <li><a href="#testimonials" className="hover:text-white transition">Testimonios</a></li>
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
  )
}

'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Trash2, Shield, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function DeleteDataPage() {
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmationCode, setConfirmationCode] = useState('')
  const [statusCheckLoading, setStatusCheckLoading] = useState(false)
  const [statusResult, setStatusResult] = useState<any>(null)

  const [formData, setFormData] = useState({
    platform: '',
    email: '',
    phone: '',
    reason: '',
    confirmationCode: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/data-deletion/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: formData.platform,
          userEmail: formData.email,
          userPhone: formData.phone,
          reason: formData.reason
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al enviar solicitud')
      }

      setConfirmationCode(data.confirmationCode)
      setSubmitted(true)
      toast.success('Solicitud enviada exitosamente')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const checkStatus = async () => {
    if (!formData.confirmationCode) {
      toast.error('Ingresa un código de confirmación')
      return
    }

    setStatusCheckLoading(true)
    try {
      const res = await fetch(`/api/data-deletion/status?code=${formData.confirmationCode}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al consultar estado')
      }

      setStatusResult(data)
    } catch (error: any) {
      toast.error(error.message)
      setStatusResult(null)
    } finally {
      setStatusCheckLoading(false)
    }
  }

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
      <section className="bg-gradient-to-br from-red-600 to-red-800 py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center mb-4">
            <Trash2 className="h-16 w-16 text-white/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Solicitar Eliminación de Datos
          </h1>
          <p className="text-xl text-red-100 max-w-2xl mx-auto">
            Solicita la eliminación de tus datos personales de nuestras plataformas integradas con Meta (Facebook, Instagram, WhatsApp).
          </p>
          <p className="text-sm text-red-200 mt-4">Última actualización: 14 de mayo de 2026</p>
        </div>
      </section>

      {/* Content */}
      <main className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Información */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  ¿Por qué solicitar eliminación de datos?
                </CardTitle>
                <CardDescription>
                  Cumple con los requisitos de privacidad de Meta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600">
                  De acuerdo con los <strong>Términos de Plataforma de Meta</strong>, tienes derecho a solicitar la eliminación 
                  de tus datos cuando utilices aplicaciones que se integran con Facebook, Instagram o WhatsApp.
                </p>
                <div className="grid md:grid-cols-3 gap-4 mt-4">
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <div className="text-2xl mb-2">📘</div>
                    <p className="font-medium text-sm">Facebook</p>
                  </div>
                  <div className="p-4 bg-pink-50 rounded-lg text-center">
                    <div className="text-2xl mb-2">📸</div>
                    <p className="font-medium text-sm">Instagram</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <div className="text-2xl mb-2">💬</div>
                    <p className="font-medium text-sm">WhatsApp</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!submitted ? (
              /* Formulario de Solicitud */
              <Card>
                <CardHeader>
                  <CardTitle>Solicitar Eliminación de Datos</CardTitle>
                  <CardDescription>
                    Completa el formulario para iniciar el proceso de eliminación
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="platform">Plataforma *</Label>
                      <Select 
                        value={formData.platform} 
                        onValueChange={(value) => setFormData({ ...formData, platform: value })}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona la plataforma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="facebook">Facebook</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="multiple">Múltiples plataformas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Correo electrónico associado a tu cuenta</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="tu@email.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono (opcional)</Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+52 123 456 7890"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reason">Razón de la solicitud (opcional)</Label>
                      <Textarea
                        id="reason"
                        placeholder="¿Por qué solicitas la eliminación de tus datos?"
                        value={formData.reason}
                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                        <div className="text-sm text-yellow-800">
                          <p className="font-medium">Nota importante:</p>
                          <p>La eliminación de datos puede tomar hasta 30 días. Recibirás un código de confirmación 
                          que podrás usar para verificar el estado de tu solicitud.</p>
                        </div>
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando solicitud...
                        </>
                      ) : (
                        'Enviar Solicitud de Eliminación'
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : (
              /* Confirmación */
              <Card className="border-green-500 bg-green-50">
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <div className="flex justify-center">
                      <CheckCircle className="h-16 w-16 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">¡Solicitud Enviada!</h2>
                    <p className="text-gray-600">
                      Tu solicitud de eliminación de datos ha sido registrada exitosamente.
                    </p>
                    
                    <div className="bg-white p-4 rounded-lg border border-green-200 inline-block">
                      <p className="text-sm text-gray-600">Código de confirmación:</p>
                      <p className="text-2xl font-mono font-bold text-green-700">{confirmationCode}</p>
                    </div>

                    <p className="text-sm text-gray-500">
                      Guarda este código para verificar el estado de tu solicitud.
                      También puedes consultar el estado más abajo.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Consultar Estado */}
            <Card>
              <CardHeader>
                <CardTitle>Consultar Estado de Solicitud</CardTitle>
                <CardDescription>
                  Usa tu código de confirmación para verificar el estado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Input
                    placeholder="Ingresa tu código de confirmación"
                    value={formData.confirmationCode}
                    onChange={(e) => setFormData({ ...formData, confirmationCode: e.target.value })}
                    className="flex-1"
                  />
                  <Button onClick={checkStatus} disabled={statusCheckLoading}>
                    {statusCheckLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Consultar'
                    )}
                  </Button>
                </div>

                {statusResult && (
                  <div className={`p-4 rounded-lg border ${
                    statusResult.status === 'completed' ? 'bg-green-50 border-green-200' :
                    statusResult.status === 'processing' ? 'bg-blue-50 border-blue-200' :
                    statusResult.status === 'rejected' ? 'bg-red-50 border-red-200' :
                    'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      {statusResult.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
                      {statusResult.status === 'processing' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
                      {statusResult.status === 'rejected' && <AlertCircle className="h-5 w-5 text-red-600" />}
                      {statusResult.status === 'pending' && <AlertCircle className="h-5 w-5 text-yellow-600" />}
                      
                      <div>
                        <p className="font-medium capitalize">Estado: {statusResult.status}</p>
                        <p className="text-sm text-gray-600">
                          {statusResult.status === 'completed' 
                            ? 'Tu solicitud ha sido procesada. Todos los datos solicitados han sido eliminados.'
                            : statusResult.status === 'processing'
                            ? 'Tu solicitud está siendo procesada. Te notificaremos cuando esté completa.'
                            : statusResult.status === 'rejected'
                            ? 'Tu solicitud fue rechazada. Contacta soporte para más información.'
                            : 'Tu solicitud está siendo revisada. Por favor espera.'
                          }
                        </p>
                        {statusResult.processedAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            Procesado el: {new Date(statusResult.processedAt).toLocaleDateString('es-MX')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Información adicional */}
            <Card>
              <CardHeader>
                <CardTitle>Preguntas Frecuentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900">¿Qué datos se eliminarán?</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Se eliminarán todos los datos asociados a tu cuenta en nuestras integraciones con Meta, 
                    incluyendo: información de perfil, historial de conversaciones, metadatos y cualquier 
                    dato procesado a través de Facebook, Instagram o WhatsApp.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900">¿Cuánto tiempo tarda el proceso?</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    El proceso de eliminación puede tomar hasta 30 días. Esto incluye la eliminación 
                    de tus datos de nuestros sistemas y la verificación con Meta.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900">¿Qué pasa después de la eliminación?</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Una vez completada la eliminación, no podrás recuperar tus datos. Si deseas usar 
                    nuestros servicios nuevamente, tendrás que crear una nueva cuenta.
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900">¿Cómo puedo contactar soporte?</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Si tienes preguntas sobre este proceso, contacta a soporte@volkern.app
                  </p>
                </div>
              </CardContent>
            </Card>

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
                <li><Link href="/delete-data" className="hover:text-white transition">Eliminación de Datos</Link></li>
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
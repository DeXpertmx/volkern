
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle, Mail, Phone, User, MessageSquare, Send, AlertTriangle } from 'lucide-react'

export default function EmbedContactPage() {
  const searchParams = useSearchParams()
  const tenantId = searchParams.get('tenantId')
  
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    notas: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [tenantError, setTenantError] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!tenantId) {
      console.error('No tenantId provided in URL params')
      setTenantError(true)
    }
  }, [tenantId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!tenantId) {
      toast({
        title: 'Error',
        description: 'Configuración inválida. Contacta al administrador.',
        variant: 'destructive',
      })
      return
    }
    
    setIsLoading(true)

    try {
      const response = await fetch('/api/public/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          tenantId: tenantId
        }),
      })

      const result = await response.json()

      if (result.success) {
        setIsSubmitted(true)
        toast({
          title: '¡Mensaje enviado!',
          description: 'Gracias por tu interés. Te contactaremos pronto.',
        })
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Hubo un problema al enviar tu mensaje.',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo enviar el mensaje. Inténtalo de nuevo.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Error de configuración
  if (tenantError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="text-center p-8">
            <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Configuración Incorrecta</h2>
            <p className="text-gray-600 mb-4">
              Este formulario no está correctamente configurado. Por favor, contacta al administrador del sitio.
            </p>
            <p className="text-xs text-muted-foreground">
              Código de error: TENANT_ID_MISSING
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-lg animate-fade-in">
          <CardContent className="text-center p-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Gracias!</h2>
            <p className="text-gray-600 mb-6">
              Hemos recibido tu mensaje y te contactaremos muy pronto.
            </p>
            <Button 
              onClick={() => {
                setIsSubmitted(false)
                setFormData({ nombre: '', email: '', telefono: '', notas: '' })
              }}
              variant="outline"
            >
              Enviar otro mensaje
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mb-4">
            <Mail className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Contáctanos</CardTitle>
          <CardDescription>
            Queremos conocer más sobre tu proyecto y cómo podemos ayudarte
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre completo *</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="nombre"
                  name="nombre"
                  type="text"
                  placeholder="Tu nombre completo"
                  value={formData.nombre}
                  onChange={handleChange}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="telefono"
                  name="telefono"
                  type="tel"
                  placeholder="+52 555 123 4567"
                  value={formData.telefono}
                  onChange={handleChange}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Mensaje</Label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea
                  id="notas"
                  name="notas"
                  placeholder="Cuéntanos sobre tu proyecto o consulta..."
                  value={formData.notas}
                  onChange={handleChange}
                  className="pl-10 min-h-[100px] resize-none"
                  rows={4}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Enviando...
                </div>
              ) : (
                <div className="flex items-center">
                  <Send className="h-4 w-4 mr-2" />
                  Enviar mensaje
                </div>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Al enviar este formulario, aceptas que procesemos tu información para contactarte sobre nuestros servicios.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

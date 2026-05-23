
'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from '@/components/ui/dialog'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { 
  Check, 
  X, 
  Settings, 
  ExternalLink, 
  Copy,
  Loader2,
  Plug,
  CreditCard,
  Calendar,
  MessageSquare,
  Mail,
  Eye,
  BarChart,
  Search,
  Users,
  MessageCircle,
  Bot,
  RefreshCw,
  Key,
  ArrowRight,
  Building
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Integration {
  id: string
  tipo: string
  nombre: string
  conectado: boolean
  activo: boolean
  credenciales: any
  configuracion?: any
  ultimaSincronizacion?: string
  fechaCreacion: string
}

const INTEGRACIONES_DISPONIBLES = [
  {
    tipo: 'meta_pixel',
    nombre: 'Meta Pixel',
    descripcion: 'Rastrea conversiones y optimiza tus anuncios de Facebook/Instagram',
    icono: Eye,
    color: 'bg-blue-500',
    campos: [
      { name: 'pixelId', label: 'Pixel ID', type: 'text', placeholder: '1234567890123456', required: true }
    ],
    instrucciones: 'Para obtener tu Pixel ID:',
    pasos: [
      'Ve a Facebook Events Manager (business.facebook.com/events_manager)',
      'Selecciona tu píxel',
      'Encuentra tu Pixel ID en la parte superior'
    ],
    documentacion: 'https://www.facebook.com/business/help/952192354843755'
  },
  {
    tipo: 'ga4',
    nombre: 'Google Analytics 4',
    descripcion: 'Analiza el tráfico y comportamiento de usuarios en tus páginas',
    icono: BarChart,
    color: 'bg-orange-500',
    campos: [
      { name: 'measurementId', label: 'Measurement ID', type: 'text', placeholder: 'G-XXXXXXXXXX', required: true }
    ],
    instrucciones: 'Para obtener tu Measurement ID:',
    pasos: [
      'Ve a Google Analytics (analytics.google.com)',
      'Selecciona tu propiedad',
      'Ve a Admin > Data Streams',
      'Copia el Measurement ID (G-XXXXXXXXXX)'
    ],
    documentacion: 'https://support.google.com/analytics/answer/9539598'
  },
  {
    tipo: 'twilio',
    nombre: 'Twilio SMS',
    descripcion: 'Envía SMS y mensajes de WhatsApp a tus leads',
    icono: MessageSquare,
    color: 'bg-red-500',
    campos: [
      { name: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', required: true },
      { name: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', required: true },
      { name: 'phoneNumber', label: 'Teléfono (opcional)', type: 'text', placeholder: '+1234567890', required: false }
    ],
    instrucciones: 'Para obtener tus credenciales de Twilio:',
    pasos: [
      'Ve a Twilio Console (console.twilio.com)',
      'Encuentra tu Account SID y Auth Token en el dashboard',
      'Opcionalmente, agrega tu número de Twilio'
    ],
    documentacion: 'https://www.twilio.com/docs/usage/api'
  },
  {
    tipo: 'mailchimp',
    nombre: 'Mailchimp',
    descripcion: 'Sincroniza tus leads con listas de Mailchimp',
    icono: Mail,
    color: 'bg-yellow-500',
    campos: [
      { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us1', required: true },
      { name: 'listId', label: 'List ID (opcional)', type: 'text', placeholder: 'xxxxxxxxxx', required: false }
    ],
    instrucciones: 'Para obtener tu API Key de Mailchimp:',
    pasos: [
      'Ve a Mailchimp (mailchimp.com)',
      'Account > Extras > API Keys',
      'Crea una nueva API Key',
      'Opcionalmente, encuentra tu List ID en Audience > Settings'
    ],
    documentacion: 'https://mailchimp.com/help/about-api-keys/'
  },
  {
    tipo: 'brevo',
    nombre: 'Brevo (Sendinblue)',
    descripcion: 'Automatiza emails transaccionales y campañas',
    icono: Mail,
    color: 'bg-green-500',
    campos: [
      { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'xkeysib-xxxxxxxxxxxxxxxx', required: true }
    ],
    instrucciones: 'Para obtener tu API Key de Brevo:',
    pasos: [
      'Ve a Brevo (brevo.com)',
      'Account > SMTP & API',
      'Crea una nueva API Key (v3)',
      'Copia la API Key generada'
    ],
    documentacion: 'https://developers.brevo.com/'
  },
  {
    tipo: 'stripe',
    nombre: 'Stripe',
    descripcion: 'Procesa pagos y gestiona suscripciones (avanzado)',
    icono: CreditCard,
    color: 'bg-purple-500',
    campos: [
      { name: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk_test_...', required: true },
      { name: 'publicKey', label: 'Publishable Key (opcional)', type: 'text', placeholder: 'pk_test_...', required: false }
    ],
    instrucciones: 'Para obtener tus keys de Stripe:',
    pasos: [
      'Ve a Stripe Dashboard (dashboard.stripe.com)',
      'Developers > API Keys',
      'Copia tu Secret Key y Publishable Key',
      '⚠️ Usa keys de test (sk_test_) para desarrollo'
    ],
    documentacion: 'https://stripe.com/docs/keys',
    avanzado: true
  },
  {
    tipo: 'google_calendar',
    nombre: 'Google Calendar & Tasks',
    descripcion: 'Sincroniza citas y tareas con Google Calendar y Google Tasks',
    icono: Calendar,
    color: 'bg-blue-600',
    campos: [
      { name: 'clientId', label: 'Client ID', type: 'text', placeholder: 'xxx.apps.googleusercontent.com', required: true },
      { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'GOCSPX-xxx', required: true }
    ],
    instrucciones: 'Para configurar Google Calendar & Tasks:',
    pasos: [
      'Ve a Google Cloud Console (console.cloud.google.com)',
      'Crea un proyecto y habilita Calendar API y Tasks API',
      'Credenciales > Crear credenciales > OAuth 2.0',
      'Copia Client ID y Client Secret'
    ],
    documentacion: 'https://developers.google.com/calendar/api/quickstart',
    avanzado: true
  },
  {
    tipo: 'evolution',
    nombre: 'Evolution API',
    descripcion: 'Conecta tu WhatsApp Business para enviar y recibir mensajes directamente',
    icono: MessageSquare,
    color: 'bg-green-600',
    categoria: 'mensajeria',
    campos: [
      { name: 'api_key', label: 'API Key', type: 'password', placeholder: 'tu-api-key-aqui', required: true },
      { name: 'instance_name', label: 'Nombre de Instancia', type: 'text', placeholder: 'nombre-instancia', required: true },
      { name: 'api_url', label: 'URL de API (opcional)', type: 'text', placeholder: 'https://evo.abacus.ai', defaultValue: 'https://evo.abacus.ai' }
    ],
    instrucciones: 'Para configurar Evolution API:',
    pasos: [
      '1. Obtén tu API Key desde tu panel de Evolution API',
      '2. Copia el nombre de tu instancia de WhatsApp',
      '3. Configura el webhook en Evolution API:',
      '   • URL: https://volkern.app/api/webhooks/evolution',
      '   • Eventos: messages.upsert',
      '4. Escanea el código QR para conectar tu WhatsApp',
      '5. Los mensajes se sincronizarán automáticamente'
    ],
    documentacion: 'https://doc.evolution-api.com/',
    caracteristicas: [
      '✅ Envío y recepción de mensajes WhatsApp',
      '✅ Captura automática de leads desde WhatsApp',
      '✅ Mensajes sincronizados en tiempo real',
      '✅ Soporte para texto, imágenes y documentos',
      '✅ Gestión de instancia (estado, QR, reinicio)',
      '✅ Integración con módulo de Mensajes',
      '✅ Scoring automático de leads'
    ]
  },
  {
    tipo: 'anytimebot',
    nombre: 'Anytimebot',
    descripcion: 'Sincroniza leads, citas y mensajes desde tu chatbot de Anytimebot',
    icono: Bot,
    color: 'bg-cyan-500',
    categoria: 'chatbot',
    campos: [
      { name: 'username', label: 'Username de Anytimebot', type: 'text', placeholder: 'tu-username', required: true },
      { name: 'webhookSecret', label: 'Webhook Secret (recomendado)', type: 'password', placeholder: 'tu-secret-seguro-aqui', helper: 'Usado para verificar la autenticidad de los webhooks' },
      { name: 'sincronizarLeads', label: '¿Sincronizar leads?', type: 'checkbox', defaultValue: true },
      { name: 'sincronizarCitas', label: '¿Sincronizar citas?', type: 'checkbox', defaultValue: true },
      { name: 'sincronizarMensajes', label: '¿Sincronizar mensajes?', type: 'checkbox', defaultValue: true },
      { name: 'numeroWhatsApp', label: 'Número WhatsApp (opcional)', type: 'text', placeholder: '+52XXXXXXXXXX' }
    ],
    instrucciones: 'Para configurar la integración con Anytimebot:',
    pasos: [
      '1. Ve a tu cuenta de Anytimebot (anytimebot.app)',
      '2. Copia tu username (aparece en la URL: anytimebot.app/USERNAME)',
      '3. Genera un webhook secret seguro (opcional pero recomendado)',
      '4. Configura el webhook unificado en Anytimebot Dashboard:',
      '   • URL: https://volkern.app/api/webhooks/anytimebot',
      '   • Eventos: BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED, MESSAGE_RECEIVED',
      '   • Secret: El mismo que ingresaste aquí',
      '5. Los webhooks sincronizarán automáticamente:'
    ],
    documentacion: 'https://anytimebot.app/docs/api',
    caracteristicas: [
      '✅ Captura automática de leads desde conversaciones',
      '✅ Sincronización bidireccional de citas (crear, cancelar, reagendar)',
      '✅ Mensajes sincronizados al módulo de Mensajes',
      '✅ Integración con campañas de WhatsApp',
      '✅ Scoring automático de leads',
      '✅ Verificación HMAC SHA-256 para seguridad',
      '✅ Historial completo de conversaciones'
    ]
  },
  {
    tipo: 'telegram',
    nombre: 'Telegram Bot',
    descripcion: 'Recibe notificaciones del CRM: nuevos leads, ventas, citas y alertas (GRATUITO)',
    icono: MessageCircle,
    color: 'bg-sky-500',
    categoria: 'mensajeria',
    campos: [
      { name: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', required: true }
    ],
    instrucciones: 'Para crear y configurar tu bot de Telegram:',
    pasos: [
      '1. Abre Telegram y busca @BotFather',
      '2. Envía el comando /newbot',
      '3. Sigue las instrucciones (nombre y username del bot)',
      '4. BotFather te dará un Bot Token',
      '5. Copia ese token y pégalo aquí'
    ],
    documentacion: 'https://core.telegram.org/bots/api',
    caracteristicas: [
      '✅ Notificaciones de nuevos leads',
      '✅ Alertas de ventas y citas',
      '✅ Recordatorios y tareas',
      '✅ 100% gratuito (sin costos de Meta)'
    ]
  },
  {
    tipo: 'whatsapp_business',
    nombre: 'WhatsApp Business',
    descripcion: 'Comunícate con tus clientes vía WhatsApp usando la API oficial de Meta',
    icono: MessageSquare,
    color: 'bg-green-500',
    categoria: 'mensajeria',
    campos: [
      { name: 'phone_number_id', label: 'Phone Number ID', type: 'text', placeholder: '123456789012345', required: true },
      { name: 'business_account_id', label: 'Business Account ID', type: 'text', placeholder: '987654321098765', required: true },
      { name: 'access_token', label: 'Access Token', type: 'password', placeholder: 'EAAGxxxxxxxxxxxxxxxx...', required: true }
    ],
    instrucciones: 'Para configurar WhatsApp Business API:',
    pasos: [
      '1. Ve a Meta for Developers (developers.facebook.com)',
      '2. Crea una aplicación tipo "Business"',
      '3. Agrega el producto "WhatsApp"',
      '4. Ve a WhatsApp > Getting Started',
      '5. Copia tu Phone Number ID y Business Account ID',
      '6. Genera un Access Token permanente',
      '⚠️ Requiere cuenta de Meta Business verificada'
    ],
    documentacion: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    caracteristicas: [
      '✅ Envío y recepción de mensajes',
      '✅ Plantillas de mensajes aprobados',
      '✅ Integración con chatbot',
      '✅ API oficial de Meta (confiable)',
      '⚠️ Costo por mensaje según Meta'
    ]
  },
  {
    tipo: 'whatsapp_twilio',
    nombre: 'WhatsApp vía Twilio',
    descripcion: 'Conecta WhatsApp a través de Twilio para enviar y recibir mensajes',
    icono: MessageSquare,
    color: 'bg-red-500',
    categoria: 'mensajeria',
    campos: [
      { name: 'account_sid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', required: true },
      { name: 'auth_token', label: 'Auth Token', type: 'password', placeholder: 'Tu Auth Token de Twilio', required: true },
      { name: 'phone_number', label: 'Número WhatsApp', type: 'text', placeholder: '+14155238886', required: true }
    ],
    instrucciones: 'Para configurar WhatsApp vía Twilio:',
    pasos: [
      '1. Accede a tu cuenta en twilio.com/console',
      '2. Copia el Account SID y Auth Token',
      '3. Ve a Messaging > Try it out > Send a WhatsApp Message',
      '4. Activa tu Twilio Sandbox o conecta tu número de WhatsApp Business',
      '5. Ingresa las credenciales aquí',
      '6. Después de guardar, configura el webhook en Twilio con la URL proporcionada'
    ],
    documentacion: 'https://www.twilio.com/docs/whatsapp',
    caracteristicas: [
      '✅ Envío y recepción de mensajes WhatsApp',
      '✅ Integración automática con el Hub de Comunicaciones',
      '✅ Soporte para mensajes multimedia',
      '✅ Sandbox disponible para pruebas',
      '⚠️ Requiere cuenta activa de Twilio'
    ]
  },
  {
    tipo: 'stripe_invoicing',
    nombre: 'Stripe Invoicing',
    descripcion: 'Genera facturas legales y cobra online de forma global con Stripe',
    icono: CreditCard,
    color: 'bg-indigo-600',
    categoria: 'contabilidad',
    campos: [
      { name: 'activo', label: 'Estado de Facturación', type: 'checkbox', defaultValue: true }
    ],
    instrucciones: 'Para activar Stripe Invoicing:',
    pasos: [
      '1. Asegúrate de tener configurado Stripe en la pestaña de Pagos',
      '2. Activa este interruptor para que Volkern pueda emitir facturas',
      '3. Configura tus datos fiscales en la pestaña de Configuración > Fiscal'
    ],
    documentacion: 'https://stripe.com/docs/billing/invoicing',
    caracteristicas: [
      '✅ Facturación global en múltiples monedas',
      '✅ Cobro automático por tarjeta y transferencia',
      '✅ Enlaces de pago integrados en la factura',
      '✅ Reconciliación automática'
    ]
  },
  {
    tipo: 'square',
    nombre: 'Square',
    descripcion: 'Acepta pagos presenciales y online, y genera facturas legales con Square',
    icono: CreditCard,
    color: 'bg-black',
    categoria: 'contabilidad',
    campos: [
      { name: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'EAAAl...', required: true },
      { name: 'locationId', label: 'Location ID', type: 'text', placeholder: 'L...', required: true },
      { name: 'environment', label: 'Entorno', type: 'select', options: [{ label: 'Sandbox', value: 'sandbox' }, { label: 'Producción', value: 'production' }], defaultValue: 'sandbox' }
    ],
    instrucciones: 'Para configurar Square:',
    pasos: [
      '1. Ve a Square Developer Dashboard (developer.squareup.com)',
      '2. Crea una aplicación o selecciona una existente',
      '3. En Producción o Sandbox, copia el Access Token',
      '4. Ve a Locations y copia el ID de la ubicación que deseas usar'
    ],
    documentacion: 'https://developer.squareup.com/docs/invoices-api/overview',
    caracteristicas: [
      '✅ Creación de facturas locales e internacionales',
      '✅ Procesamiento de pagos con tarjeta integrado',
      '✅ Notificaciones automáticas de pago',
      '✅ Gestión de clientes en Square'
    ]
  },
  {
    tipo: 'gocardless',
    nombre: 'GoCardless',
    descripcion: 'Cobros automáticos por domiciliación bancaria (Direct Debit/SEPA)',
    icono: Building,
    color: 'bg-blue-600',
    categoria: 'contabilidad',
    directConnect: true,
    campos: [
      { name: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'xxxxxxxxxxxxxxxx', required: true },
      { name: 'environment', label: 'Entorno', type: 'select', options: [{ label: 'Sandbox', value: 'sandbox' }, { label: 'Live', value: 'live' }], defaultValue: 'sandbox' }
    ],
    instrucciones: 'Recomendamos usar la conexión directa:',
    pasos: [
      '1. Haz clic en "Conectar con GoCardless" abajo',
      '2. Autoriza a Volkern en el portal de GoCardless',
      '3. Serás redirigido automáticamente tras el éxito',
      'Nota: También puedes usar un Access Token manual si lo prefieres.'
    ],
    documentacion: 'https://developer.gocardless.com/getting-started/api/introduction/',
    caracteristicas: [
      '✅ Cobros SEPA y Direct Debit automáticos',
      '✅ Gestión de mandatos directamente desde el CRM',
      '✅ Ideal para suscripciones y servicios recurrentes',
      '✅ Menores comisiones que las tarjetas de crédito'
    ]
  }
]

export default function IntegracionesPage() {
  const { data: session } = useSession() || {}
  const [integraciones, setIntegraciones] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [tenantId, setTenantId] = useState<string>('')
  const [webhookUrl, setWebhookUrl] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedIntegracion, setSelectedIntegracion] = useState<any>(null)
  const [formData, setFormData] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    cargarIntegraciones()
    obtenerTenantId()
  }, [])

  const obtenerTenantId = async () => {
    try {
      const res = await fetch('/api/users/me')
      if (res.ok) {
        const data = await res.json()
        const tid = data.tenant?.id || ''
        setTenantId(tid)
        setWebhookUrl(`${window.location.origin}/api/webhooks/${tid}`)
      }
    } catch (error) {
      console.error('Error al obtener tenant ID:', error)
    }
  }

  const cargarIntegraciones = async () => {
    try {
      const res = await fetch('/api/integraciones')
      if (res.ok) {
        const data = await res.json()
        const allIntegrations = [...data]
        
        // Load Evolution API integration
        try {
          const evolutionRes = await fetch('/api/integraciones/evolution')
          if (evolutionRes.ok) {
            const evolutionData = await evolutionRes.json()
            if (evolutionData.configured && evolutionData.integration) {
              allIntegrations.push({
                id: evolutionData.integration.id,
                tipo: 'evolution',
                nombre: 'Evolution API',
                conectado: evolutionData.integration.conectado,
                activo: evolutionData.integration.activo,
                credenciales: {
                  api_key: evolutionData.integration.api_key,
                  instance_name: evolutionData.integration.instance_name,
                  api_url: evolutionData.integration.api_url
                },
                ultimaSincronizacion: evolutionData.integration.ultimaSincronizacion,
                fechaCreacion: evolutionData.integration.fechaCreacion
              })
            }
          }
        } catch (error) {
          console.error('Error loading Evolution API integration:', error)
        }
        
        // Load Anytimebot integration
        try {
          const anytimebotRes = await fetch('/api/integraciones/anytimebot')
          if (anytimebotRes.ok) {
            const anytimebotData = await anytimebotRes.json()
            if (anytimebotData.configured && anytimebotData.integration) {
              allIntegrations.push({
                id: anytimebotData.integration.id,
                tipo: 'anytimebot',
                nombre: 'Anytimebot',
                conectado: anytimebotData.integration.activo,
                activo: anytimebotData.integration.activo,
                credenciales: {
                  username: anytimebotData.integration.username
                },
                configuracion: anytimebotData.integration,
                ultimaSincronizacion: anytimebotData.integration.ultimaSincronizacion,
                fechaCreacion: anytimebotData.integration.fechaCreacion
              })
            }
          }
        } catch (error) {
          console.error('Error loading Anytimebot integration:', error)
        }

        // Load Google Calendar integration
        try {
          const gcalRes = await fetch('/api/integraciones/google-calendar/status')
          if (gcalRes.ok) {
            const gcalData = await gcalRes.json()
            if (gcalData.conectado) {
              allIntegrations.push({
                id: 'google-calendar',
                tipo: 'google_calendar',
                nombre: 'Google Calendar',
                conectado: gcalData.activo,
                activo: gcalData.activo,
                credenciales: {},
                configuracion: {
                  totalCitasSincronizadas: gcalData.totalCitasSincronizadas,
                  ultimaSync: gcalData.ultimaSync,
                  errorUltimaSync: gcalData.errorUltimaSync
                },
                ultimaSincronizacion: gcalData.ultimaSync,
                fechaCreacion: gcalData.conectadoDesde
              })
            }
          }
        } catch (error) {
          console.error('Error loading Google Calendar integration:', error)
        }

        
        setIntegraciones(allIntegrations)
      }
    } catch (error) {
      console.error('Error al cargar integraciones:', error)
      toast.error('Error al cargar integraciones')
    } finally {
      setLoading(false)
    }
  }

  const abrirDialog = (integracion: any) => {
    setSelectedIntegracion(integracion)
    
    // Inicializar con valores por defecto
    const defaultValues: any = {}
    integracion.campos.forEach((campo: any) => {
      if (campo.defaultValue !== undefined) {
        defaultValues[campo.name] = campo.defaultValue
      }
    })
    
    // Cargar datos existentes si ya está conectado
    const existente = integraciones.find(i => i.tipo === integracion.tipo)
    if (existente) {
      const existingData = { ...defaultValues }
      
      if (integracion.tipo === 'evolution' && existente.credenciales) {
        // Para Evolution API, cargar desde credenciales
        existingData.api_key = existente.credenciales.api_key || ''
        existingData.instance_name = existente.credenciales.instance_name || ''
        existingData.api_url = existente.credenciales.api_url || 'https://evo.abacus.ai'
      } else if (integracion.tipo === 'anytimebot' && existente.configuracion) {
        // Para Anytimebot, cargar desde configuracion
        existingData.username = existente.configuracion.username || existente.credenciales?.username || ''
        existingData.webhookSecret = existente.configuracion.webhookSecret || ''
        existingData.sincronizarLeads = existente.configuracion.sincronizarLeads !== undefined 
          ? existente.configuracion.sincronizarLeads 
          : true
        existingData.sincronizarCitas = existente.configuracion.sincronizarCitas !== undefined 
          ? existente.configuracion.sincronizarCitas 
          : true
        existingData.sincronizarMensajes = existente.configuracion.sincronizarMensajes !== undefined 
          ? existente.configuracion.sincronizarMensajes 
          : true
        existingData.numeroWhatsApp = existente.configuracion.numeroWhatsApp || ''
      } else if (existente.credenciales) {
        // Para otras integraciones, cargar desde credenciales
        Object.assign(existingData, existente.credenciales)
      }
      
      setFormData(existingData)
    } else {
      setFormData(defaultValues)
    }
    
    setDialogOpen(true)
  }

  const cerrarDialog = () => {
    setDialogOpen(false)
    setSelectedIntegracion(null)
    setFormData({})
  }

  const handleInputChange = (campo: string, valor: string | boolean) => {
    setFormData((prev: any) => ({
      ...prev,
      [campo]: valor
    }))
  }


  const probarConexion = async () => {
    console.log('[DEBUG probarConexion] Called, selectedIntegracion:', selectedIntegracion?.tipo, 'formData:', JSON.stringify(formData))
    if (!selectedIntegracion) {
      console.log('[DEBUG probarConexion] EARLY RETURN: selectedIntegracion is null/undefined')
      return
    }

    // Validar campos requeridos
    const camposRequeridos = selectedIntegracion.campos.filter((c: any) => c.required)
    for (const campo of camposRequeridos) {
      if (!formData[campo.name]) {
        toast.error(`El campo ${campo.label} es requerido`)
        return
      }
    }

    setTesting(true)
    try {

      // Clean username for Anytimebot before testing
      const testData = { ...formData }
      if (selectedIntegracion.tipo === 'anytimebot' && testData.username) {
        testData.username = testData.username.trim()
        if (testData.username.includes('anytimebot.app')) {
          const match = testData.username.match(/anytimebot\.app\/(?:username\/)?([^\/\?]+)/i)
          if (match) {
            testData.username = match[1]
          }
        }
      }

      // Add timeout to fetch request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

      const res = await fetch('/api/integraciones/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: selectedIntegracion.tipo,
          credenciales: testData
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // Always read JSON response even on error
      const data = await res.json()

      if (res.ok && data.success) {
        toast.success(data.mensaje || 'Conexión exitosa')
        // Update username in form if it was cleaned
        if (data.username && selectedIntegracion.tipo === 'anytimebot') {
          handleInputChange('username', data.username)
        }
      } else {
        // Show error message from response
        toast.error(data.mensaje || data.error || 'Error al probar conexión')
      }
    } catch (error: any) {
      console.error('Error testing connection:', error)
      if (error.name === 'AbortError') {
        toast.error('La prueba de conexión tomó demasiado tiempo. Por favor, intenta de nuevo.')
      } else {
        toast.error(error.message || 'Error al probar conexión')
      }
    } finally {
      setTesting(false)
    }
  }

  const probarSincronizacionCitas = async () => {
    if (selectedIntegracion?.tipo !== 'anytimebot') {
      toast.error('Esta función solo está disponible para Anytimebot')
      return
    }

    setTesting(true)
    try {
      const res = await fetch('/api/webhooks/anytimebot/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast.success(
          <div>
            <p className="font-semibold">✅ Sincronización exitosa</p>
            <p className="text-sm mt-1">
              Cita ID: <code className="bg-muted px-1 rounded">{data.citaId}</code>
            </p>
            <p className="text-sm">
              Lead ID: <code className="bg-muted px-1 rounded">{data.leadId}</code>
            </p>
          </div>,
          { duration: 6000 }
        )
      } else {
        toast.error(
          <div>
            <p className="font-semibold">❌ Error en la sincronización</p>
            <p className="text-sm mt-1">{data.error || 'Revisa los logs del servidor'}</p>
          </div>,
          { duration: 8000 }
        )
      }
    } catch (error: any) {
      console.error('Error testing citas sync:', error)
      toast.error('Error al probar sincronización de citas')
    } finally {
      setTesting(false)
    }
  }

  // 📅 Google Calendar Functions
  const conectarGoogleCalendar = () => {
    // Redirigir al flujo OAuth
    window.location.href = '/api/integraciones/google-calendar/auth'
  }

  const desconectarGoogleCalendar = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/integraciones/google-calendar/disconnect', {
        method: 'POST'
      })

      if (res.ok) {
        toast.success('Google Calendar desconectado correctamente')
        cerrarDialog()
        await cargarIntegraciones()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al desconectar Google Calendar')
      }
    } catch (error: any) {
      console.error('Error disconnecting Google Calendar:', error)
      toast.error('Error al desconectar Google Calendar')
    } finally {
      setSaving(false)
    }
  }

  const sincronizarManualmente = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/integraciones/google-calendar/sync', {
        method: 'POST'
      })

      const data = await res.json()

      if (res.ok && data.success) {
        const volkernToGoogle = data.data?.volkernToGoogle || {}
        const totalSynced = data.data?.totalSyncedAppointments || 0
        
        toast.success(
          <div>
            <p className="font-semibold">✅ Sincronización bidireccional completada</p>
            <div className="text-sm mt-2 space-y-1">
              <p>📤 Volkern → Google: {volkernToGoogle.sincronizadas || 0} de {volkernToGoogle.total || 0} enviadas</p>
              <p>📥 Google → Volkern: Eventos importados</p>
              <p className="font-semibold mt-2">📊 Total sincronizadas: {totalSynced}</p>
            </div>
          </div>,
          { duration: 6000 }
        )
        // Recargar integraciones para actualizar el contador
        await cargarIntegraciones()
      } else {
        toast.error(data.error || 'Error al sincronizar citas')
      }
    } catch (error: any) {
      console.error('Error syncing with Google Calendar:', error)
      toast.error('Error al sincronizar con Google Calendar')
    } finally {
      setTesting(false)
    }
  }

  const guardarIntegracion = async () => {
    console.log('[DEBUG guardarIntegracion] Called, selectedIntegracion:', selectedIntegracion?.tipo, 'formData:', JSON.stringify(formData))
    if (!selectedIntegracion) {
      console.log('[DEBUG guardarIntegracion] EARLY RETURN: selectedIntegracion is null/undefined')
      return
    }

    // Validar campos requeridos
    const camposRequeridos = selectedIntegracion.campos.filter((c: any) => c.required)
    for (const campo of camposRequeridos) {
      if (!formData[campo.name]) {
        toast.error(`El campo ${campo.label} es requerido`)
        return
      }
    }

    setSaving(true)
    try {
      // Handle Evolution API integration separately
      if (selectedIntegracion.tipo === 'evolution') {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const res = await fetch('/api/integraciones/evolution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        const data = await res.json()

        if (res.ok && data.success) {
          toast.success(data.message || 'Integración con Evolution API configurada exitosamente')
          cerrarDialog()
          await cargarIntegraciones()
        } else {
          toast.error(data.error || 'Error al configurar Evolution API', {
            duration: 5000,
          })
          
          if (data.details) {
            console.error('Error details:', data.details)
          }
        }
      }
      // Handle Anytimebot integration separately
      else if (selectedIntegracion.tipo === 'anytimebot') {
        // Clean username from URL if provided
        const cleanData = { ...formData }
        if (cleanData.username) {
          cleanData.username = cleanData.username.trim()
          if (cleanData.username.includes('anytimebot.app')) {
            const match = cleanData.username.match(/anytimebot\.app\/(?:username\/)?([^\/\?]+)/i)
            if (match) {
              cleanData.username = match[1]
            }
          }
        }

        // Add timeout to save request
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000) // 20 second timeout

        const res = await fetch('/api/integraciones/anytimebot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanData),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        // Always read JSON response even on error
        const data = await res.json()

        if (res.ok && data.success) {
          toast.success(data.message || 'Integración con Anytimebot configurada exitosamente')
          cerrarDialog()
          await cargarIntegraciones()
        } else {
          // Show detailed error message
          const errorMessage = data.error || 'Error al configurar Anytimebot'
          toast.error(errorMessage, {
            duration: 5000,
          })
          
          // Log additional details for debugging
          if (data.details) {
            console.error('Error details:', data.details)
          }
          if (data.hint) {
            console.info('Hint:', data.hint)
            // Show hint after 1 second
            setTimeout(() => {
              toast.info(data.hint, { duration: 5000 })
            }, 1000)
          }
        }
      }
      // Handle Twilio SMS integration
      else if (selectedIntegracion.tipo === 'twilio') {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const res = await fetch('/api/integraciones/twilio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        const data = await res.json()

        if (res.ok && data.success) {
          toast.success(data.message || 'Twilio SMS configurado exitosamente')
          cerrarDialog()
          await cargarIntegraciones()
        } else {
          toast.error(data.error || 'Error al configurar Twilio SMS', {
            duration: 5000,
          })
        }
      }
      // Handle WhatsApp Twilio integration
      else if (selectedIntegracion.tipo === 'whatsapp_twilio') {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const res = await fetch('/api/integraciones/whatsapp-twilio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        const data = await res.json()

        if (res.ok && data.success) {
          toast.success(data.message || 'WhatsApp vía Twilio configurado exitosamente')
          // Mostrar información del webhook
          if (data.webhookInfo?.twilioWebhook) {
            setTimeout(() => {
              toast.info(
                `Configura este webhook en Twilio:\n${data.webhookInfo.twilioWebhook}`,
                { duration: 15000 }
              )
            }, 1500)
          }
          cerrarDialog()
          await cargarIntegraciones()
        } else {
          toast.error(data.error || 'Error al configurar WhatsApp vía Twilio', {
            duration: 5000,
          })
          if (data.details) {
            console.error('Error details:', data.details)
          }
        }
      }
      // Handle WhatsApp Business (Cloud API) integration
      else if (selectedIntegracion.tipo === 'whatsapp_business') {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const res = await fetch('/api/integraciones/whatsapp-business', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        const data = await res.json()

        if (res.ok && data.success) {
          toast.success(data.message || 'WhatsApp Business configurado exitosamente')
          cerrarDialog()
          await cargarIntegraciones()
        } else {
          toast.error(data.error || 'Error al configurar WhatsApp Business', {
            duration: 5000,
          })
          if (data.details) {
            console.error('Error details:', data.details)
          }
        }
      } else {
        // Handle other integrations
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const res = await fetch('/api/integraciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: selectedIntegracion.tipo,
            nombre: selectedIntegracion.nombre,
            credenciales: formData,
            activo: true
          }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        // Always read JSON response even on error
        const data = await res.json()

        if (res.ok) {
          toast.success('Integración guardada exitosamente')
          cerrarDialog()
          await cargarIntegraciones()
        } else {
          toast.error(data.error || 'Error al guardar integración')
        }
      }
    } catch (error: any) {
      console.error('Error saving integration:', error)
      if (error.name === 'AbortError') {
        toast.error('La operación tomó demasiado tiempo. Por favor, verifica tu conexión e intenta de nuevo.')
      } else {
        toast.error(error.message || 'Error al guardar integración')
      }
    } finally {
      setSaving(false)
    }
  }

  const copiarWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    toast.success('URL copiada al portapapeles')
  }

  const getIntegracionStatus = (tipo: string) => {
    const integracion = integraciones.find(i => i.tipo === tipo)
    return integracion
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integraciones</h1>
        <p className="text-muted-foreground mt-2">
          Conecta Volkern con tus herramientas favoritas para automatizar tu negocio
        </p>
      </div>

      {/* Banner de Webhooks de Entrada */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600 rounded-lg">
                <Plug className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl">Webhooks de Entrada</CardTitle>
                <CardDescription>
                  Recibe datos desde n8n, Make, Zapier y cualquier plataforma externa
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={() => window.location.href = '/dashboard/integraciones/webhooks'}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Settings className="h-4 w-4 mr-2" />
              Gestionar Webhooks
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">URLs únicas y seguras</p>
                <p className="text-muted-foreground text-xs">
                  Cada webhook tiene un UUID único con validación HMAC opcional
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Acciones configurables</p>
                <p className="text-muted-foreground text-xs">
                  Crea leads, dispara automatizaciones o ejecuta tareas personalizadas
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Monitoreo completo</p>
                <p className="text-muted-foreground text-xs">
                  Historial detallado de todas las entregas con logs y estadísticas
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Banner de Webhooks de Salida */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-600 rounded-lg">
                <ExternalLink className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl">Webhooks de Salida</CardTitle>
                <CardDescription>
                  Notifica automáticamente a n8n, Make, Zapier cuando ocurra un evento en Volkern
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={() => window.location.href = '/dashboard/integraciones/webhooks-salientes'}
              className="bg-green-600 hover:bg-green-700"
            >
              <Settings className="h-4 w-4 mr-2" />
              Gestionar Webhooks
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Notificaciones automáticas</p>
                <p className="text-muted-foreground text-xs">
                  Envía datos a servicios externos cuando ocurren eventos (leads, citas, mensajes)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Reintentos automáticos</p>
                <p className="text-muted-foreground text-xs">
                  Sistema inteligente de reintentos con respaldo exponencial
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Seguridad HMAC</p>
                <p className="text-muted-foreground text-xs">
                  Firma criptográfica SHA-256 para validar autenticidad de los datos
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Banner de API Keys */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-600 rounded-lg">
                <Key className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl">API Keys</CardTitle>
                <CardDescription>
                  Genera claves de API para integrar Volkern CRM con aplicaciones personalizadas
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={() => window.location.href = '/dashboard/configuracion/api-keys'}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Settings className="h-4 w-4 mr-2" />
              Gestionar API Keys
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Permisos granulares</p>
                <p className="text-muted-foreground text-xs">
                  Define scopes específicos por módulo (leads, contactos, deals, etc.)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Autenticación segura</p>
                <p className="text-muted-foreground text-xs">
                  Claves con formato vk_prod_ hasheadas con SHA256
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Métricas de uso</p>
                <p className="text-muted-foreground text-xs">
                  Rastrea último uso, total de llamadas y fechas de expiración
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook URL */}
      {webhookUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Webhook URL
            </CardTitle>
            <CardDescription>
              URL única para recibir eventos de servicios externos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button onClick={copiarWebhookUrl} variant="outline" size="icon">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Usa esta URL en servicios como Stripe, Twilio, Mailchimp para recibir notificaciones en tiempo real
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs organizadas por tipo de integración */}
      <Tabs defaultValue="comunicacion" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="comunicacion">Comunicación</TabsTrigger>
          <TabsTrigger value="contabilidad">Contabilidad</TabsTrigger>
          <TabsTrigger value="tracking">Analytics</TabsTrigger>
        </TabsList>

        {/* Tab: Comunicación (Email, SMS, Chatbots) */}
        <TabsContent value="comunicacion" className="space-y-4">
          <Alert>
            <AlertDescription>
              Conecta canales de comunicación para mensajes automáticos, campañas y soporte a clientes.
            </AlertDescription>
          </Alert>
          
          <h3 className="text-lg font-semibold mb-3">Canales de Comunicación</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INTEGRACIONES_DISPONIBLES
              .filter(int => ['telegram', 'whatsapp_business', 'whatsapp_twilio', 'twilio'].includes(int.tipo))
              .map((integracion) => {
                const status = getIntegracionStatus(integracion.tipo)
                const Icon = integracion.icono

                return (
                  <Card key={integracion.tipo} className="relative overflow-hidden">
                    <div className={`absolute top-0 left-0 right-0 h-1 ${integracion.color}`} />
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${integracion.color} bg-opacity-10`}>
                            <Icon className={`h-5 w-5 text-white`} />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{integracion.nombre}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {integracion.descripcion}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {status?.conectado ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                          <Check className="h-3 w-3 mr-1" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <X className="h-3 w-3 mr-1" />
                          No conectado
                        </Badge>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => abrirDialog(integracion)}
                          variant={status?.conectado ? 'outline' : 'default'}
                          size="sm"
                          className="flex-1"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          {status?.conectado ? 'Configurar' : 'Conectar'}
                        </Button>
                        {integracion.documentacion && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={integracion.documentacion} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </TabsContent>

        {/* Tab: Contabilidad y Facturación */}
        <TabsContent value="contabilidad" className="space-y-4">
          <Alert>
            <AlertDescription>
              Gestiona tus servicios de facturación, ERP y contabilidad para automatizar el cobro del negocio.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INTEGRACIONES_DISPONIBLES
              .filter(int => int.categoria === 'contabilidad' || ['stripe', 'google_calendar'].includes(int.tipo))
              .map((integracion) => {
                const status = getIntegracionStatus(integracion.tipo)
                const Icon = integracion.icono

                return (
                  <Card key={integracion.tipo} className="relative overflow-hidden">
                    <div className={`absolute top-0 left-0 right-0 h-1 ${integracion.color}`} />
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${integracion.color} bg-opacity-10`}>
                            <Icon className={`h-5 w-5 text-white`} />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{integracion.nombre}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {integracion.descripcion}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {status?.conectado ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                          <Check className="h-3 w-3 mr-1" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <X className="h-3 w-3 mr-1" />
                          No conectado
                        </Badge>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => abrirDialog(integracion)}
                          variant={status?.conectado ? 'outline' : 'default'}
                          size="sm"
                          className="flex-1"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          {status?.conectado ? 'Configurar' : 'Conectar'}
                        </Button>
                        {integracion.documentacion && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={integracion.documentacion} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </TabsContent>

        {/* Tab: Tracking & Analytics */}
        <TabsContent value="tracking" className="space-y-4">
          <Alert>
            <AlertDescription>
              Rastrea conversiones, analiza el comportamiento de usuarios y optimiza tus campañas.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INTEGRACIONES_DISPONIBLES
              .filter(int => ['meta_pixel', 'ga4'].includes(int.tipo))
              .map((integracion) => {
                const status = getIntegracionStatus(integracion.tipo)
                const Icon = integracion.icono

                return (
                  <Card key={integracion.tipo} className="relative overflow-hidden">
                    <div className={`absolute top-0 left-0 right-0 h-1 ${integracion.color}`} />
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${integracion.color} bg-opacity-10`}>
                            <Icon className={`h-5 w-5 text-white`} />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{integracion.nombre}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {integracion.descripcion}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {status?.conectado ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                          <Check className="h-3 w-3 mr-1" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <X className="h-3 w-3 mr-1" />
                          No conectado
                        </Badge>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => abrirDialog(integracion)}
                          variant={status?.conectado ? 'outline' : 'default'}
                          size="sm"
                          className="flex-1"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          {status?.conectado ? 'Configurar' : 'Conectar'}
                        </Button>
                        {integracion.documentacion && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={integracion.documentacion} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de configuración */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedIntegracion && (
                <>
                  <div className={`p-2 rounded-lg ${selectedIntegracion.color} bg-opacity-10`}>
                    <selectedIntegracion.icono className="h-5 w-5" />
                  </div>
                  Configurar {selectedIntegracion.nombre}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedIntegracion?.descripcion}
            </DialogDescription>
          </DialogHeader>

          {selectedIntegracion && (
            <div className="space-y-4 overflow-y-auto flex-1">
              {/* Instrucciones */}
              <Alert>
                <AlertDescription>
                  <p className="font-medium mb-2">{selectedIntegracion.instrucciones}</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {selectedIntegracion.pasos.map((paso: string, idx: number) => (
                      <li key={idx}>{paso}</li>
                    ))}
                  </ol>
                  {selectedIntegracion.documentacion && (
                    <a 
                      href={selectedIntegracion.documentacion} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm flex items-center gap-1 mt-2"
                    >
                      Ver documentación completa
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </AlertDescription>
              </Alert>

              {/* UI especial para GoCardless Connect */}
              {selectedIntegracion.tipo === 'gocardless' && (
                <div className="space-y-4 py-4 border-b">
                  <div className="flex flex-col items-center justify-center p-6 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800 text-center">
                    <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-sm mb-4 border border-blue-50 dark:border-blue-700">
                      <Building className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100 mb-2">Conexión Directa GoCardless</h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-6 max-w-sm">
                      Vincula tu cuenta de GoCardless de forma segura con un solo clic. Sin necesidad de copiar API keys manuales.
                    </p>
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                      <Button 
                        onClick={() => {
                          window.location.href = `/api/integrations/gocardless/connect?env=${formData.environment || 'sandbox'}`
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 shadow-lg shadow-blue-600/20"
                      >
                        Conectar con GoCardless
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                      <div className="flex items-center justify-center gap-4 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input 
                            type="radio" 
                            name="env" 
                            value="sandbox" 
                            checked={(formData.environment || 'sandbox') === 'sandbox'} 
                            onChange={() => setFormData({...formData, environment: 'sandbox'})}
                          />
                          Sandbox
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input 
                            type="radio" 
                            name="env" 
                            value="live" 
                            checked={formData.environment === 'live'} 
                            onChange={() => setFormData({...formData, environment: 'live'})}
                          />
                          Live
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground italic">O usa configuración manual</span>
                    </div>
                  </div>
                </div>
              )}

              {/* UI especial para Google Calendar */}
              {selectedIntegracion.tipo === 'google_calendar' ? (
                <div className="space-y-4">
                  {getIntegracionStatus('google_calendar')?.conectado ? (
                    <>
                      <Card className="bg-green-50 border-green-200">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-green-500 rounded-full">
                              <Check className="h-6 w-6 text-white" />
                            </div>
                            <div>
                              <p className="font-semibold text-green-900">Conectado exitosamente</p>
                              <p className="text-sm text-green-700">
                                Tus citas y tareas se sincronizarán automáticamente con Google
                              </p>
                            </div>
                          </div>
                          
                          {/* Google Tasks info */}
                          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-sm font-medium text-blue-900 flex items-center gap-2">
                              <Check className="h-4 w-4" />
                              Google Tasks habilitado
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                              Las tareas creadas para leads se sincronizarán automáticamente a la lista "Volkern CRM" en Google Tasks
                            </p>
                          </div>

                          {getIntegracionStatus('google_calendar')?.configuracion && (
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between py-2 border-t border-green-200">
                                <span className="text-green-700">Citas sincronizadas:</span>
                                <span className="font-semibold text-green-900">
                                  {getIntegracionStatus('google_calendar')?.configuracion?.totalCitasSincronizadas || 0}
                                </span>
                              </div>
                              {getIntegracionStatus('google_calendar')?.configuracion?.ultimaSync && (
                                <div className="flex justify-between py-2 border-t border-green-200">
                                  <span className="text-green-700">Última sincronización:</span>
                                  <span className="font-semibold text-green-900">
                                    {new Date(getIntegracionStatus('google_calendar')!.configuracion!.ultimaSync).toLocaleString('es-ES')}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <div className="flex gap-2">
                        <Button
                          onClick={sincronizarManualmente}
                          disabled={testing}
                          className="flex-1"
                        >
                          {testing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Sincronizando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Sincronizar Ahora
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={desconectarGoogleCalendar}
                          variant="destructive"
                          disabled={saving}
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Desconectando...
                            </>
                          ) : (
                            <>
                              <X className="h-4 w-4 mr-2" />
                              Desconectar
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Alert>
                        <AlertDescription>
                          <p className="font-medium mb-3">🔐 Autenticación segura con Google</p>
                          <ul className="space-y-2 text-sm">
                            <li className="flex items-start gap-2">
                              <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>Autorización OAuth 2.0 segura</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>Sincronización automática de citas con Google Calendar</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>Sincronización automática de tareas con Google Tasks</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>No requiere configuración manual de credenciales</span>
                            </li>
                          </ul>
                        </AlertDescription>
                      </Alert>

                      <Button
                        onClick={conectarGoogleCalendar}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        size="lg"
                      >
                        <Calendar className="h-5 w-5 mr-2" />
                        Conectar con Google Calendar
                      </Button>

                      <p className="text-xs text-muted-foreground text-center">
                        Serás redirigido a Google para autorizar el acceso a tu calendario
                      </p>
                    </>
                  )}
                </div>
              ) : (
                /* Formulario normal para otras integraciones */
                <div className="space-y-4">
                  {selectedIntegracion.campos.map((campo: any) => (
                    <div key={campo.name} className="space-y-2">
                      {campo.type === 'checkbox' ? (
                        <div className="flex items-center space-x-2">
                          <input
                            id={campo.name}
                            type="checkbox"
                            checked={formData[campo.name] !== undefined ? formData[campo.name] : campo.defaultValue}
                            onChange={(e) => handleInputChange(campo.name, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Label htmlFor={campo.name} className="font-normal cursor-pointer">
                            {campo.label}
                          </Label>
                        </div>
                      ) : (
                        <>
                          <Label htmlFor={campo.name}>
                            {campo.label}
                            {campo.required && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                          <Input
                            id={campo.name}
                            type={campo.type}
                            placeholder={campo.placeholder}
                            value={formData[campo.name] || ''}
                            onChange={(e) => handleInputChange(campo.name, e.target.value)}
                          />
                          {campo.helper && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {campo.helper}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer: Ocultar para Google Calendar ya que tiene botones propios */}
          {selectedIntegracion?.tipo !== 'google_calendar' && (
            <DialogFooter className="flex gap-2 mt-4 pt-4 border-t flex-shrink-0">
              {selectedIntegracion && !['meta_pixel', 'ga4'].includes(selectedIntegracion.tipo) && (
                <Button
                  type="button"
                  onClick={probarConexion}
                  variant="outline"
                  disabled={testing || saving}
                >
                  {testing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Probando...
                    </>
                  ) : (
                    'Probar Conexión'
                  )}
                </Button>
              )}
              {selectedIntegracion?.tipo === 'anytimebot' && (
                <Button
                  type="button"
                  onClick={probarSincronizacionCitas}
                  variant="outline"
                  disabled={testing || saving}
                  className="bg-blue-50 hover:bg-blue-100 border-blue-200"
                >
                  {testing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Probando...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4 mr-2" />
                      Probar Citas
                    </>
                  )}
                </Button>
              )}
              <Button type="button" onClick={cerrarDialog} variant="outline" disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={guardarIntegracion} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar'
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
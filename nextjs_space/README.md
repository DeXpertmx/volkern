
# Fluy CRM - Sistema de Gestión de Leads y Citas

Un CRM completo y plataforma de automatización diseñada para emprendedores digitales, coaches y agencias en México, España, Portugal y Colombia.

## 🚀 Características Principales

### 📝 Captura de Leads
- Formulario de contacto embebible
- Guardado automático en base de datos
- Notificaciones por email al administrador
- Validación de formularios

### 📅 Sistema de Agendamiento  
- Calendario embebible para clientes
- Selección de servicios disponibles
- Gestión de horarios y disponibilidad
- Confirmaciones automáticas por email

### 💳 Integración con Stripe
- Pagos seguros al momento de agendar
- Soporte para múltiples monedas (USD, MXN, EUR, COP)
- Webhooks para confirmación de pagos
- Gestión de estados de pago

### 📧 Notificaciones Automáticas
- Email de nuevo lead capturado
- Confirmación de citas agendadas  
- Confirmación de pagos recibidos
- Integración con Resend

### 🎛️ Panel de Administración
- Dashboard con métricas clave
- Gestión completa de leads
- Calendario de citas
- Administración de servicios
- Configuración del sistema

### 📱 Diseño Responsive
- Mobile-first design
- Interfaz moderna y profesional
- Componentes embebibles (iframe)
- Navegación intuitiva

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 14 + React 18 + TypeScript
- **Estilos**: Tailwind CSS + Shadcn/UI
- **Base de Datos**: PostgreSQL + Prisma ORM
- **Autenticación**: NextAuth.js
- **Pagos**: Stripe
- **Emails**: Resend
- **Gráficos**: Recharts
- **Deployment**: Vercel-ready

## 📦 Instalación

### Requisitos previos
- Node.js 18+ 
- Yarn o npm
- PostgreSQL database
- Cuentas en Stripe y Resend

### 1. Clonar e instalar dependencias

```bash
git clone <repository-url>
cd fluy_crm/nextjs_space
yarn install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env.local` y configura las siguientes variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/fluy_crm"

# NextAuth.js
NEXTAUTH_SECRET="tu-secret-key-aqui"
NEXTAUTH_URL="http://localhost:3000"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..." # Opcional para desarrollo

# Resend
RESEND_API_KEY="re_..."

# Admin
ADMIN_EMAIL="admin@tudominio.com"
```

### 3. Configurar la base de datos

```bash
# Generar cliente de Prisma
yarn prisma generate

# Aplicar migraciones
yarn prisma db push

# Poblar con datos de ejemplo
yarn prisma db seed
```

### 4. Ejecutar en desarrollo

```bash
yarn dev
```

La aplicación estará disponible en `http://localhost:3000`

## 🔑 Credenciales por Defecto

Después de ejecutar el seed, puedes acceder con:

- **Email**: `admin@fluy.com`  
- **Password**: `fluy123456`

## 📋 Configuración de Stripe

### 1. Crear cuenta en Stripe
1. Regístrate en [https://stripe.com](https://stripe.com)
2. Activa tu cuenta y completa la configuración
3. Obtén tus API keys desde el dashboard

### 2. Configurar Webhooks (Producción)
1. En el dashboard de Stripe, ve a "Webhooks"
2. Agrega endpoint: `https://tudominio.com/api/webhooks/stripe`
3. Selecciona eventos: `checkout.session.completed`
4. Copia el webhook secret a `STRIPE_WEBHOOK_SECRET`

### 3. Configurar productos (opcional)
Los servicios se crean dinámicamente, pero puedes pre-configurar productos en Stripe para mayor control.

## 📧 Configuración de Resend

### 1. Crear cuenta en Resend
1. Regístrate en [https://resend.com](https://resend.com)
2. Verifica tu dominio de email
3. Obtén tu API key

### 2. Configurar dominio
1. Agrega tu dominio en Resend
2. Configura los registros DNS necesarios
3. Verifica la configuración

### 3. Personalizar emails
Los templates de email están en `lib/email.ts` y pueden personalizarse según tu marca.

## 🌐 Páginas Embebibles

### Formulario de Contacto
```html
<iframe 
  src="https://tudominio.com/embed/contact" 
  width="100%" 
  height="600"
  frameborder="0">
</iframe>
```

### Calendario de Agendamiento  
```html
<iframe 
  src="https://tudominio.com/embed/booking" 
  width="100%" 
  height="800"
  frameborder="0">
</iframe>
```

## 🚀 Deployment

### Vercel (Recomendado)

1. Conecta tu repositorio a Vercel
2. Configura las variables de entorno
3. Deploy automático desde main branch

### Variables de entorno en producción:
- Actualiza `NEXTAUTH_URL` con tu dominio
- Usa credenciales de producción de Stripe
- Configura el webhook de Stripe con tu dominio
- Verifica la configuración de Resend

### Otras plataformas

La aplicación es compatible con cualquier plataforma que soporte Next.js:
- Railway
- Render  
- DigitalOcean App Platform
- AWS Amplify

## 📊 Estructura del Proyecto

```
fluy_crm/nextjs_space/
├── app/                    # App Router (Next.js 14)
│   ├── api/               # API routes
│   ├── auth/              # Páginas de autenticación
│   ├── dashboard/         # Panel administrativo
│   ├── embed/            # Páginas embebibles
│   └── payment/          # Páginas de pago
├── components/            # Componentes reutilizables
├── lib/                  # Utilidades y configuración
├── prisma/               # Esquema de base de datos
├── scripts/              # Scripts de utilidad
└── public/               # Archivos estáticos
```

## 🔧 Comandos Útiles

```bash
# Desarrollo
yarn dev                    # Iniciar servidor de desarrollo
yarn build                  # Construir para producción
yarn start                  # Iniciar servidor de producción

# Base de datos
yarn prisma studio         # Explorador visual de BD
yarn prisma db seed        # Poblar con datos de ejemplo
yarn prisma db push        # Aplicar cambios del esquema
yarn prisma generate       # Generar cliente

# Lint y formato
yarn lint                   # Ejecutar ESLint
yarn type-check            # Verificar tipos TypeScript
```

## 🎨 Personalización

### Colores y Tema
Modifica `tailwind.config.ts` y `app/globals.css` para personalizar colores, fuentes y estilos.

### Email Templates
Edita `lib/email.ts` para personalizar los templates de email con tu marca.

### Configuración de Servicios
Los servicios se pueden gestionar desde el panel admin o directamente en la base de datos.

## 📚 API Endpoints

### Públicos
- `POST /api/leads` - Crear nuevo lead
- `POST /api/webhooks/stripe` - Webhook de Stripe
- `GET /api/servicios?activo=true` - Servicios activos

### Autenticados
- `GET /api/dashboard` - Estadísticas del dashboard
- `GET /api/leads` - Listar leads
- `POST /api/citas` - Crear cita
- `POST /api/checkout` - Crear sesión de Stripe

## 🐛 Troubleshooting

### Problemas comunes

1. **Error de conexión a BD**: Verifica `DATABASE_URL`
2. **Webhooks no funcionan**: Revisa `STRIPE_WEBHOOK_SECRET`
3. **Emails no se envían**: Confirma configuración de Resend
4. **Errores de autenticación**: Verifica `NEXTAUTH_SECRET` y `NEXTAUTH_URL`

### Logs
Los logs están disponibles en:
- Consola del navegador (frontend)
- Terminal de desarrollo (backend)
- Dashboard de Vercel (producción)

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Haz fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

Si necesitas ayuda:

1. Revisa la documentación
2. Busca en issues existentes
3. Crea un nuevo issue con detalles del problema
4. Para soporte empresarial, contacta: support@fluy.app

---

Desarrollado con ❤️ para emprendedores digitales por el equipo de Fluy.

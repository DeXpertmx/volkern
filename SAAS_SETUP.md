
# 🚀 Volkern CRM - Configuración SaaS

## ✅ Fase 1 Completada

Volkern CRM ahora es un **SaaS completamente funcional** con:

- ✅ Landing page pública con pricing
- ✅ Signup que crea tenants automáticamente
- ✅ Sistema de trial de 14 días
- ✅ Integración con Stripe Subscriptions
- ✅ Webhook handler completo
- ✅ Dashboard de billing para clientes
- ✅ Banner de trial en el dashboard

---

## 📋 Configuración de Stripe (IMPORTANTE)

### 1. Crear Productos y Precios en Stripe Dashboard

Ve a [Stripe Dashboard → Productos](https://dashboard.stripe.com/products) y crea los siguientes productos:

#### Producto 1: Plan Básico
- **Nombre**: Plan Básico
- **Precio**: $29 USD / mes
- **Billing**: Recurrente mensual
- **Copiar el Price ID** (empieza con `price_...`)

#### Producto 2: Plan Profesional
- **Nombre**: Plan Profesional
- **Precio**: $79 USD / mes
- **Billing**: Recurrente mensual
- **Copiar el Price ID**

#### Producto 3: Plan Empresarial
- **Nombre**: Plan Empresarial
- **Precio**: $199 USD / mes
- **Billing**: Recurrente mensual
- **Copiar el Price ID**

### 2. Configurar Variables de Entorno

Agrega estas variables a tu `.env`:

```bash
# Stripe Keys (ya deberías tener estas)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs (los que copiaste arriba)
NEXT_PUBLIC_STRIPE_PRICE_BASICO=price_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_PROFESIONAL=price_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_EMPRESARIAL=price_xxxxxxxxxxxxx

# Webhook Secret (configurar en el paso 3)
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# URL de tu aplicación
NEXTURL=https://volkern.app
```

### 3. Configurar Webhook en Stripe

1. Ve a [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click en "Add endpoint"
3. Endpoint URL: `https://volkern.app/api/webhooks/stripe`
4. Selecciona estos eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click en "Add endpoint"
6. **Copiar el Signing Secret** (empieza con `whsec_...`)
7. Agrégalo a tu `.env` como `STRIPE_WEBHOOK_SECRET`

---

## 🔄 Flujo Completo del Usuario

### 1. **Registro (Trial Automático)**

```
Usuario visita: volkern.app
→ Click en "Prueba Gratis"
→ Llena formulario:
   - Nombre de empresa
   - Nombre completo
   - Email
   - Contraseña
→ Sistema crea:
   ✅ Tenant nuevo con slug único
   ✅ Usuario owner/admin
   ✅ Roles básicos
   ✅ Pipeline stages
   ✅ Trial de 14 días
→ Redirige a login
→ Usuario inicia sesión
→ Ve dashboard con banner de trial
```

### 2. **Durante el Trial**

- Banner muestra días restantes
- Cuando quedan ≤3 días, banner se vuelve rojo (urgente)
- Usuario puede explorar todas las features
- Límites del plan trial:
  - 100 leads
  - 2 usuarios
  - 500 emails/mes
  - etc.

### 3. **Conversión a Plan Pago**

```
Usuario click en "Ver Planes" (desde banner o sidebar)
→ Ve página /dashboard/configuracion/billing
→ Compara planes (Básico, Profesional, Empresarial)
→ Click en "Suscribirse"
→ Redirige a Stripe Checkout
→ Completa pago con tarjeta
→ Webhook actualiza tenant:
   ✅ estado: 'trial' → 'activo'
   ✅ plan: 'trial' → 'basico' (o el que eligió)
   ✅ Agrega stripeCustomerId
   ✅ Actualiza límites del plan
→ Usuario regresa al dashboard
→ Banner de trial desaparece
→ Tiene acceso completo al plan
```

### 4. **Gestión de Suscripción**

En `/dashboard/configuracion/billing` el usuario puede:

- Ver plan actual y estado
- Ver fecha de renovación
- Ver límites de uso
- **Cambiar de plan** (upgrade/downgrade)
- **Cancelar suscripción** (acceso hasta fin de período)

---

## 🧪 Cómo Probar Localmente

### 1. Usar Stripe CLI para webhooks

```bash
# Instalar Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks a tu localhost
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe

# Copiar el webhook secret que te da y ponerlo en .env
```

### 2. Crear una cuenta de prueba

```
1. Visita: http://localhost:3000
2. Click en "Prueba Gratis"
3. Registra una cuenta
4. Inicia sesión
5. Ve el banner de trial
6. Click en "Ver Planes"
7. Prueba suscribirte con tarjeta de prueba de Stripe:
   - Número: 4242 4242 4242 4242
   - Fecha: Cualquier fecha futura
   - CVV: Cualquier 3 dígitos
```

### 3. Verificar webhook

En la terminal de Stripe CLI verás los eventos llegando:
```
✔ Received event checkout.session.completed
✔ Received event customer.subscription.created
✔ Received event invoice.payment_succeeded
```

---

## 📊 Monitoreo en Stripe Dashboard

Después de configurar, podrás ver en Stripe Dashboard:

- **Customers**: Todos los tenants registrados
- **Subscriptions**: Suscripciones activas/canceladas
- **Payments**: Pagos recibidos
- **MRR (Monthly Recurring Revenue)**: Ingresos mensuales

---

## 🔐 Seguridad

- ✅ Webhooks verificados con Stripe Signature
- ✅ Passwords hasheados con bcrypt
- ✅ NextAuth para autenticación
- ✅ API routes protegidas con getServerSession
- ✅ Multi-tenancy: datos aislados por tenant

---

## 🎯 Próximos Pasos (Fase 2)

1. **Sistema de límites activo**: Validar límites antes de crear leads/usuarios/etc
2. **Emails transaccionales**: Bienvenida, trial ending, payment failed
3. **Onboarding wizard**: Configuración inicial guiada
4. **Analytics para admins**: Dashboard con MRR, churn, LTV
5. **Gestión de métodos de pago**: Actualizar tarjeta

---

## 🆘 Troubleshooting

### El webhook no funciona

1. Verifica que STRIPE_WEBHOOK_SECRET esté en .env
2. Revisa que la URL del webhook en Stripe sea correcta
3. Revisa los logs del webhook en Stripe Dashboard

### La suscripción no se activa

1. Ve a Stripe Dashboard → Logs
2. Busca errores en los eventos
3. Verifica que los Price IDs sean correctos

### El trial no aparece

1. Verifica que el signup creó el tenant correctamente
2. Revisa que fechaTrialFin esté configurada
3. Revisa que el estado sea 'trial'

---

**¡Volkern CRM está listo para funcionar como un SaaS completo!** 🎉

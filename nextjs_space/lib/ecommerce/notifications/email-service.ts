import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  currency: string;
  items: {
    concepto: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }[];
  shippingAddress: {
    nombre: string;
    linea1: string;
    ciudad: string;
    codigoPostal: string;
    pais: string;
  };
  trackingNumber?: string;
  trackingUrl?: string;
  shippingCarrier?: string;
  invoiceNumber?: string;
}

const currencySymbol = (currency: string) =>
  currency === 'EUR' ? '€' : currency === 'MXN' ? '$' : currency;

export async function sendOrderConfirmationEmail(data: OrderEmailData) {
  const sym = currencySymbol(data.currency);

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1a56db, #7c3aed); padding: 40px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">¡Pedido confirmado!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Pedido #${data.orderNumber}</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 16px; color: #374151;">Hola ${data.customerName},</p>
        <p style="color: #6b7280;">Tu pedido ha sido confirmado y está siendo procesado.</p>

        <h3 style="color: #111827; margin-top: 24px;">Resumen del pedido</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          ${data.items.map((item) => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 0;">
                <span style="font-weight: 500;">${item.concepto}</span>
                <span style="color: #6b7280;"> × ${item.cantidad}</span>
              </td>
              <td style="padding: 12px 0; text-align: right; font-weight: 500;">
                ${sym}${item.total.toFixed(2)}
              </td>
            </tr>
          `).join('')}
        </table>

        <div style="text-align: right; font-size: 20px; font-weight: bold; color: #111827; padding-top: 16px; border-top: 2px solid #e5e7eb;">
          Total: ${sym}${data.total.toFixed(2)}
        </div>

        <h3 style="color: #111827; margin-top: 24px;">Dirección de envío</h3>
        <p style="color: #6b7280;">
          ${data.shippingAddress.nombre}<br>
          ${data.shippingAddress.linea1}<br>
          ${data.shippingAddress.ciudad}, ${data.shippingAddress.codigoPostal}<br>
          ${data.shippingAddress.pais}
        </p>

        ${data.invoiceNumber ? `
          <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin-top: 24px;">
            <p style="color: #065f46; margin: 0; font-weight: 500;">
              ✓ Factura ${data.invoiceNumber} emitida con Veri*factu
            </p>
          </div>
        ` : ''}
      </div>
      <div style="background: #f9fafb; padding: 24px; text-align: center; border-radius: 0 0 16px 16px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          Gracias por tu compra · Volkern
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Volkern'}" <${process.env.FROM_EMAIL || 'noreply@volkern.app'}>`,
    to: data.customerEmail,
    subject: `Pedido #${data.orderNumber} confirmado`,
    html,
  });

  console.log(`[Email] Confirmación enviada para pedido ${data.orderNumber}`);
}

export async function sendShippingEmail(data: OrderEmailData) {
  const sym = currencySymbol(data.currency);

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #7c3aed, #a855f7); padding: 40px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">¡Tu pedido ha sido enviado!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Pedido #${data.orderNumber}</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 16px; color: #374151;">Hola ${data.customerName},</p>
        <p style="color: #6b7280;">Tu pedido está en camino.</p>

        ${data.trackingNumber ? `
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="color: #1e40af; margin: 0 0 8px; font-weight: 500;">
              📦 Información de envío
            </p>
            <p style="color: #1e40af; margin: 0;">
              <strong>Transportista:</strong> ${data.shippingCarrier || 'Estándar'}<br>
              <strong>Número de seguimiento:</strong> <span style="font-family: monospace;">${data.trackingNumber}</span>
            </p>
            ${data.trackingUrl ? `
              <a href="${data.trackingUrl}" style="display: inline-block; margin-top: 12px; color: #2563eb; font-weight: 500;">
                Rastrear mi paquete →
              </a>
            ` : ''}
          </div>
        ` : ''}
      </div>
      <div style="background: #f9fafb; padding: 24px; text-align: center; border-radius: 0 0 16px 16px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          Gracias por tu compra · Volkern
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Volkern'}" <${process.env.FROM_EMAIL || 'noreply@volkern.app'}>`,
    to: data.customerEmail,
    subject: `Pedido #${data.orderNumber} enviado`,
    html,
  });

  console.log(`[Email] Envío notificado para pedido ${data.orderNumber}`);
}

export async function sendOrderDeliveredEmail(data: OrderEmailData) {
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 40px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">¡Pedido entregado!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Pedido #${data.orderNumber}</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 16px; color: #374151;">Hola ${data.customerName},</p>
        <p style="color: #6b7280;">Tu pedido ha sido entregado. ¡Esperamos que disfrutes tu compra!</p>

        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="color: #065f46; margin: 0; text-align: center;">
            ¿Todo correcto? ¡Gracias por confiar en nosotros!
          </p>
        </div>
      </div>
      <div style="background: #f9fafb; padding: 24px; text-align: center; border-radius: 0 0 16px 16px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          Gracias por tu compra · Volkern
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Volkern'}" <${process.env.FROM_EMAIL || 'noreply@volkern.app'}>`,
    to: data.customerEmail,
    subject: `Pedido #${data.orderNumber} entregado`,
    html,
  });

  console.log(`[Email] Entrega notificada para pedido ${data.orderNumber}`);
}

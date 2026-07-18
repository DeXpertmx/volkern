export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import nodemailer from 'nodemailer';
import tls from 'tls';
import net from 'net';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { mode } = body;

    if (mode === 'imap') {
      return await testImap(body, auth);
    }

    return await testSmtp(body, auth);
  } catch (error: any) {
    console.error('Error al probar conexión de correo:', error);
    return NextResponse.json(
      { error: 'Error al conectar con el servidor', message: error.message },
      { status: 500 }
    );
  }
}, ['config:write', 'settings:write']);

async function testSmtp(body: any, auth: any) {
  const { host, port, user, password, encryption, fromEmail, fromName } = body;

  if (!host || !user || !password || !fromEmail) {
    return NextResponse.json(
      { error: 'Faltan campos requeridos: host, user, password, fromEmail' },
      { status: 400 }
    );
  }

  const secure = encryption === 'ssl';
  const portNum = parseInt(port) || (secure ? 465 : 587);

  const transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure,
    auth: { user, pass: password },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
    to: auth.user?.email || fromEmail,
    subject: 'Prueba de configuración SMTP - Volkern',
    text: 'Si recibes esto, tu configuración SMTP funciona correctamente.',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#10b981;">Prueba SMTP exitosa</h2>
        <p>Tu configuraci&oacute;n SMTP funciona correctamente.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <p style="font-size:12px;color:#6b7280;">
          Servidor: ${host}:${portNum} | Cifrado: ${encryption}
        </p>
      </div>
    `,
  });

  return NextResponse.json({ success: true, message: 'Correo de prueba enviado correctamente' });
}

async function testImap(body: any, _auth: any) {
  const { host, port, user, password, encryption } = body;

  if (!host || !user || !password) {
    return NextResponse.json(
      { error: 'Faltan campos requeridos: host, user, password' },
      { status: 400 }
    );
  }

  const portNum = parseInt(port) || (encryption === 'ssl' ? 993 : 143);
  const useTls = encryption === 'ssl';

  return new Promise<NextResponse>((resolve) => {
    const socket = useTls
      ? tls.connect(portNum, host, { rejectUnauthorized: false }, () => {
          socket.write(`a001 LOGIN "${user}" "${password}"\r\n`);
        })
      : net.connect(portNum, host, () => {
          if (encryption === 'tls' || encryption === 'starttls') {
            socket.write(`a001 STARTTLS\r\n`);
          } else {
            socket.write(`a001 LOGIN "${user}" "${password}"\r\n`);
          }
        });

    let response = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(NextResponse.json(
        { error: 'Tiempo de espera agotado al conectar con el servidor IMAP' },
        { status: 500 }
      ));
    }, 10000);

    socket.on('data', (data) => {
      response += data.toString();
      if (response.includes('a001 OK') || response.includes('a002 OK')) {
        clearTimeout(timeout);
        socket.end();
        resolve(NextResponse.json({ success: true, message: `Conexión IMAP exitosa (${host}:${portNum})` }));
      }
      if (response.includes('a001 NO') || response.includes('a001 BAD') || response.includes('a002 NO') || response.includes('a002 BAD')) {
        clearTimeout(timeout);
        socket.destroy();
        resolve(NextResponse.json(
          { error: 'Error de autenticación IMAP — verifica usuario y contraseña' },
          { status: 500 }
        ));
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve(NextResponse.json(
        { error: `Error de conexión IMAP: ${err.message}` },
        { status: 500 }
      ));
    });

    socket.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

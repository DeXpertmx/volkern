export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { replaceTemplateVariables } from '@/lib/ses-email';

// POST /api/email-campanas/preview - Vista previa sin campaña guardada
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const data = await request.json();

    // Variables de ejemplo
    const variables: Record<string, string> = {
      nombre: 'Juan Pérez',
      email: 'juan@ejemplo.com',
      empresa: 'Ejemplo S.A.',
      cargo: 'Director',
      telefono: '+52 55 1234 5678'
    };

    // Reemplazar variables
    let contenidoHTML = data.contenidoHTML || '';
    let asunto = data.asunto || '';

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      contenidoHTML = contenidoHTML.replace(regex, value);
      asunto = asunto.replace(regex, value);
    });

    // Agregar link de unsuscribe de ejemplo
    contenidoHTML += `<br/><br/><p style="font-size: 12px; color: #666; text-align: center;">
      <a href="#" style="color: #666; text-decoration: underline;">
        Cancelar suscripción
      </a>
    </p>`;

    return NextResponse.json({
      asunto,
      contenidoHTML,
      variables
    });
  } catch (error: any) {
    console.error('Error al generar vista previa:', error);
    return NextResponse.json(
      { error: 'Error al generar vista previa', details: error.message },
      { status: 500 }
    );
  }
}

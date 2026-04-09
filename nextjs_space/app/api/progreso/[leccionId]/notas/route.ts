export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

// Por ahora, las notas no están soportadas en el esquema actual
// Esta API retorna respuestas vacías para mantener compatibilidad con el frontend

export async function GET(
  request: Request,
  { params }: { params: { leccionId: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Retornar notas vacías por ahora
    return NextResponse.json({ notas: '' });
  } catch (error) {
    console.error('Error al obtener notas:', error);
    return NextResponse.json(
      { error: 'Error al obtener notas' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { leccionId: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Por ahora, simplemente retornar éxito
    // Las notas se pueden agregar al esquema más adelante
    return NextResponse.json({ success: true, notas: '' });
  } catch (error) {
    console.error('Error al guardar notas:', error);
    return NextResponse.json(
      { error: 'Error al guardar notas' },
      { status: 500 }
    );
  }
}

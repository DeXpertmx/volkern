import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // Verificar si ya hay artículos
    const count = await prisma.knowledgeArticle.count({ where: { tenantId } });
    if (count > 0) {
      return NextResponse.json({ message: 'Ya existe conocimiento registrado.', count });
    }

    const testArticles = [
      {
        title: 'Política de Teletrabajo Híbrido',
        content: 'Los colaboradores pueden optar por hasta 3 días de trabajo remoto previa coordinación con su gerente. Se requiere conexión estable de 20Mbps mínimo.',
        category: 'POLICY',
        tags: ['remoto', 'hibrido', 'beneficios'],
        isPublic: true,
        authorId: auth.user!.id
      },
      {
        title: 'SOP: Proceso de Venta Industrial',
        content: '1. Calificación de Lead. 2. Análisis Técnico. 3. Cotización con Margen Guard. 4. Firma Digital. 5. Emisión de OP.',
        category: 'SOP',
        tags: ['ventas', 'procesos', 'crm'],
        isPublic: true,
        authorId: auth.user!.id
      },
      {
        title: 'Guía de Integridad y Ética Volkern',
        content: 'Nuestra cultura se basa en la transparencia radical y la eficiencia operativa asíncrona. No toleramos la burocracia innecesaria.',
        category: 'CULTURE',
        tags: ['cultura', 'vision', 'etica'],
        isPublic: true,
        authorId: auth.user!.id
      }
    ];

    const created = await Promise.all(
      testArticles.map(art => 
        prisma.knowledgeArticle.create({
          data: { ...art, tenantId }
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Conocimiento base generado.', 
      count: created.length 
    });
  } catch (error: any) {
    console.error('[KnowledgeSeed] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, { requiredScopes: ['knowledge:write'] });

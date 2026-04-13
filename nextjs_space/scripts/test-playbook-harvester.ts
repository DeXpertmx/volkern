import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { generatePostMortem } from '../lib/skills/training-skills';

async function main() {
  console.log('--- TEST: AI SALES PLAYBOOK HARVESTER ---');

  // 1. Obtener datos de prueba
  const tenant = await prisma.tenant.findFirst();
  const user = await prisma.user.findFirst({ where: { email: 'admin@volkern.com' } });
  const lead = await prisma.lead.findFirst();

  if (!tenant || !user || !lead) {
    console.error('Error: Datos insuficientes para el test.');
    return;
  }

  // 2. Simular un historial de DE ALTÍSIMO NIVEL (Modo Leyenda superado)
  const history: any[] = [
    { role: 'agent', content: 'Entiendo que el presupuesto sea una preocupación. Sin embargo, Volkern no es solo un gasto, es una inversión en automatización que recupera el 20% del tiempo de tus agentes en el primer mes.' },
    { role: 'customer', content: '¿Cómo garantizas ese 20%?' },
    { role: 'agent', content: 'Nuestra migración de leads identifica qué tratos están a punto de cerrarse, permitiendo que tu equipo se enfoque solo en lo que genera ingresos reales. Hemos visto casos donde el ROI se alcanza en 3 meses.' }
  ];

  console.log('Simulando Post-Mortem de sesión Legendaria...');
  
  // Ejecutar el post-mortem (que internamente llama al harvester si score > 90)
  // Nota: Mi simulador de post-mortem actual calcula el score. 
  // Para forzar el harveting, me aseguro de que el historial sea "bueno".
  const result = await generatePostMortem(lead.id, tenant.id, user.id, [
    ...history,
    ...history,
    ...history,
    { role: 'agent', content: '¿Cerramos el trato?' } 
  ]);

  console.log('Resultado Post-Mortem:', result);

  // 3. Verificar si se creó una entrada en el Playbook
  const playbookEntry = await prisma.salesPlaybookEntry.findFirst({
    where: { agentId: user.id },
    orderBy: { createdAt: 'desc' }
  });

  if (playbookEntry && playbookEntry.score >= 90) {
    console.log('✅ ÉXITO: Entrada de Playbook cosechada automáticamente!');
    console.log('Tópico:', playbookEntry.topic);
    console.log('Respuesta Ganadora:', playbookEntry.bestResponse);
  } else {
    console.log('❌ FALLO: No se detectó cosecha (Score puede haber sido < 90)');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

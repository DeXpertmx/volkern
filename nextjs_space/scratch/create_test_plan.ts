import { globalPrisma } from '../lib/db'

async function create() {
  const plan = await globalPrisma.subscriptionPlan.create({
    data: {
      nombre: 'Plan Diamante',
      slug: 'diamante',
      precio: 499,
      moneda: 'EUR',
      intervalo: 'mensual',
      limiteUsuarios: 50,
      limiteLeads: 20000,
      limiteStorage: 100,
      limiteCursos: 50,
      limiteEstudiantes: 2000,
      activo: true,
      esPublico: true,
      features: {
        ui_features: ['Soporte VIP', 'IA Avanzada', 'API Ilimitada'],
        modules: ['crm', 'whatsapp', 'automations', 'academy']
      }
    }
  });
  
  console.log('Plan creado:', plan.nombre);
}

create();

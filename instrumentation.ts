/**
 * Next.js Instrumentation
 * Se ejecuta una vez cuando el servidor inicia
 * 
 * Usado para inicializar el Skills Layer de Volkern
 */

export async function register() {
  // Solo ejecutar en el servidor (runtime de Node.js)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('\n🔧 [Instrumentation] Iniciando servidor Next.js...');
    
    // Importar dinámicamente para evitar problemas con el cliente
    const { initializeSkillsLayer } = await import('./lib/skills/init');
    initializeSkillsLayer();
    
    console.log('✅ [Instrumentation] Skills Layer inicializado\n');
  }
}

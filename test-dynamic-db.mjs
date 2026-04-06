import { PrismaClient } from '@prisma/client'

async function testDynamicConnection() {
  const baseClient = new PrismaClient()
  
  // URL de prueba verificada
  const TEST_DB_URL = "postgresql://dexpert:volkern2024@localhost:5432/volkern_local"
  
  console.log('--- Iniciando prueba de inyección dinámica ---')
  
  try {
    // Usando la extensión de Prisma v6 para sobreescribir la URL
    const dynamicClient = baseClient.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            // Aquí podríamos interceptar o loguear
            return query(args)
          },
        },
      },
    }).$extends({
      // Esta es la parte clave para Multi-DB
      datasourceUrl: TEST_DB_URL, 
    })

    console.log('Cliente extendido creado con URL dinámica.')
    
    const startTime = Date.now()
    const plansCount = await dynamicClient.subscriptionPlan.count()
    const endTime = Date.now()
    
    console.log(`Conexión exitosa. Conteos de planes: ${plansCount}`)
    console.log(`Tiempo de respuesta: ${endTime - startTime}ms`)
    
  } catch (error) {
    console.error('Error en la conexión dinámica:', error)
  } finally {
    await baseClient.$disconnect()
  }
}

testDynamicConnection()

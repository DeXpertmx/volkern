import { KnowledgeService } from '@/lib/knowledge/knowledge-service'

const ACCOUNTING_ARTICLES = [
  {
    title: 'Tipos de IVA en España',
    content: `En España existen cuatro tipos de IVA:
- Tipo general (21%): se aplica a la mayoría de bienes y servicios.
- Tipo reducido (10%): alimentos no básicos, transporte, vivienda, hostelería.
- Tipo superreducido (4%): pan, leche, huevos, frutas, verduras, medicamentos, libros, periódicos.
- Tipo exento (0%): educación, sanidad, servicios financieros, seguros, alquiler de vivienda habitual.`,
    category: 'FISCAL',
    tags: ['IVA', 'impuestos', 'fiscal', 'Spain', 'tax'],
  },
  {
    title: 'Modelo 303 - Declaración Trimestral de IVA',
    content: `El Modelo 303 es la declaración-liquidación trimestral del IVA.
Se presenta en abril (1T), julio (2T), octubre (3T) y enero (4T/último).
Recoge el IVA repercutido (ventas) menos el IVA soportado (compras).
Si el resultado es positivo, se ingresa a Hacienda. Si es negativo, se solicita devolución o compensación.
La liquidación anual se realiza mediante el Modelo 390.`,
    category: 'FISCAL',
    tags: ['IVA', 'modelo303', 'trimestral', 'declaracion', 'AEAT'],
  },
  {
    title: 'Modelo 130 - Pago Fraccionado IRPF Autónomos',
    content: `El Modelo 130 es el pago fraccionado del IRPF para autónomos en estimación directa.
Se presenta trimestralmente: abril, julio, octubre y enero.
El cálculo es: (rendimientos - gastos) * 20%.
Si el resultado es inferior a 0, no se ingresa.
Obligatorio para autónomos persona física. Se presenta por internet en la sede de AEAT.`,
    category: 'FISCAL',
    tags: ['IRPF', 'modelo130', 'autonomos', 'fraccionado', 'AEAT'],
  },
  {
    title: 'Modelo 111 - Retenciones IRPF',
    content: `El Modelo 111 es la declaración trimestral de retenciones del IRPF.
Se aplica a: retenciones por rendimientos del trabajo y actividades económicas (profesionales autónomos) y ciertos rendimientos del capital mobiliario.
Porcentaje general: 15% para profesionales (desde 2025), 19% para otros rendimientos.
Se presenta en abril, julio, octubre y enero.
Las retenciones por arrendamiento de inmuebles urbanos se declaran en el Modelo 115 (y su resumen anual en el Modelo 180).
Incluye el resumen anual en el Modelo 190.`,
    category: 'FISCAL',
    tags: ['IRPF', 'modelo111', 'retenciones', 'AEAT', 'trimestral'],
  },
  {
    title: 'Modelo 115 - Retenciones por Arrendamientos',
    content: `El Modelo 115 es la declaración trimestral de retenciones del IRPF por arrendamiento de inmuebles urbanos.
Debes presentarlo cuando pagas el alquiler de un local u otro inmueble urbano a un arrendador (persona física o entidad sin actividad) y le practicas la retención.
Tipo de retención: 19% sobre la renta pagada (tipo general para arrendamientos de inmuebles urbanos).
Se presenta en abril (1T), julio (2T), octubre (3T) y enero (4T).
El resumen anual de estas retenciones se presenta en el Modelo 180.`,
    category: 'FISCAL',
    tags: ['IRPF', 'modelo115', 'arrendamientos', 'alquiler', 'retenciones', 'AEAT', 'trimestral'],
  },
  {
    title: 'Modelo 180 - Resumen Anual de Retenciones por Arrendamientos',
    content: `El Modelo 180 es la declaración informativa anual de retenciones e ingresos a cuenta sobre arrendamientos de inmuebles urbanos.
Resume los 4 trimestres del Modelo 115 del ejercicio anterior, detallando cada arrendador con sus rentas pagadas y retenciones practicadas.
Se presenta durante el mes de enero del año siguiente.
Es obligatorio cuando has practicado retenciones por arrendamiento durante el ejercicio.`,
    category: 'FISCAL',
    tags: ['IRPF', 'modelo180', 'arrendamientos', 'alquiler', 'resumen', 'anual', 'AEAT'],
  },
  {
    title: 'Modelo 390 - Resumen Anual de IVA',
    content: `El Modelo 390 es la declaración resumen anual del IVA.
Se presenta una vez al año, durante el mes de enero.
Incluye el resumen de todas las declaraciones trimestrales del año anterior.
Obligatorio para todos los sujetos pasivos del IVA.
Refleja el volumen de operaciones, el IVA repercutido, el IVA soportado y las operaciones intracomunitarias.`,
    category: 'FISCAL',
    tags: ['IVA', 'modelo390', 'anual', 'resumen', 'AEAT'],
  },
  {
    title: 'Verifactu - Facturación Electrónica',
    content: `Verifactu (Ley 11/2021) es la normativa española de facturación electrónica.
Obliga a que los sistemas de facturación garanticen la integridad, conservación y trazabilidad de las facturas.
Requisitos:
- Cada factura debe tener un hash SHA-256 que la vincule con la anterior (encadenamiento).
- Registro de alta, baja y modificación de facturas.
- Los sistemas deben ser verificados por la AEAT.
- Los datos deben conservarse durante 4 años.
Volkern implementa Verifactu con hash SHA-256 en todas las facturas.`,
    category: 'FISCAL',
    tags: ['Verifactu', 'facturacion', 'AEAT', 'hash', 'legal'],
  },
  {
    title: 'Plan General Contable (PGC)',
    content: `El Plan General Contable (PGC) es el marco normativo contable en España.
Estructura:
- 1ª parte: Marco conceptual (principios contables).
- 2ª parte: Normas de registro y valoración (NRV).
- 3ª parte: Cuentas anuales (Balance, PyG, Memoria, EFE, EC-PN).
- 4ª parte: Cuadro de cuentas (7 grupos numerados del 1 al 7).
- 5ª parte: Definiciones y relaciones contables.
Grupos principales: 1 (Financiación básica), 2 (Activo no corriente), 3 (Existencias), 4 (Acreedores/deudores), 5 (Cuentas financieras), 6 (Compras/gastos), 7 (Ventas/ingresos).`,
    category: 'ACCOUNTING',
    tags: ['PGC', 'contabilidad', 'plan contable', 'España', 'cuentas'],
  },
  {
    title: 'Balance de Situación',
    content: `El Balance de Situación es uno de los estados financieros fundamentales.
Muestra la situación patrimonial de la empresa en una fecha determinada.
Estructura:
- ACTIVO: Bienes y derechos (corriente + no corriente).
- PASIVO: Obligaciones y deudas (corriente + no corriente).
- PATRIMONIO NETO: Fondos propios (capital, reservas, resultado del ejercicio).
Ecuación fundamental: Activo = Pasivo + Patrimonio Neto.
En Volkern se genera automáticamente desde los asientos contables.`,
    category: 'ACCOUNTING',
    tags: ['balance', 'situacion', 'contabilidad', 'estados financieros', 'activo', 'pasivo'],
  },
  {
    title: 'Cuenta de Resultados (PyG)',
    content: `La Cuenta de Pérdidas y Ganancias (PyG) muestra el resultado del ejercicio.
Estructura:
1. Ingresos de explotación (ventas, prestación de servicios).
2. Gastos de explotación (compras, salarios, suministros, amortizaciones).
3. Resultado de explotación (EBIT) = ingresos - gastos de explotación.
4. Ingresos y gastos financieros.
5. Resultado financiero.
6. Resultado antes de impuestos.
7. Impuesto sobre beneficios.
8. Resultado del ejercicio (neto).
EBITDA = EBIT + amortizaciones + provisiones.`,
    category: 'ACCOUNTING',
    tags: ['PyG', 'resultados', 'contabilidad', 'EBIT', 'EBITDA', 'beneficios'],
  },
  {
    title: 'Balance de Comprobación',
    content: `El Balance de Comprobación (o de Sumas y Saldos) es un informe contable intermedio.
Lista todas las cuentas del PGC con:
- Debe (suma de cargos).
- Haber (suma de abonos).
- Saldo deudor (Debe - Haber, si positivo).
- Saldo acreedor (Haber - Debe, si positivo).
Propósito: verificar que la suma total del Debe = suma total del Haber.
Se utiliza antes de formular las cuentas anuales para detectar errores.
En Volkern se genera en tiempo real desde el libro mayor.`,
    category: 'ACCOUNTING',
    tags: ['balance', 'comprobacion', 'sumas', 'saldos', 'contabilidad', 'libro mayor'],
  },
  {
    title: 'Asientos Contables y Libro Diario',
    content: `Los asientos contables son el registro básico de la contabilidad por partida doble.
Cada asiento tiene: fecha, cuentas (debe y haber), importes y descripción.
Principio de partida doble: cada transacción afecta al menos a dos cuentas.
El Libro Diario registra cronológicamente todos los asientos.
El Libro Mayor agrupa los movimientos de cada cuenta individual.
En Volkern los asientos se crean manualmente o automáticamente desde facturas, nóminas y bancos.`,
    category: 'ACCOUNTING',
    tags: ['asientos', 'diario', 'mayor', 'contabilidad', 'partida doble'],
  },
  {
    title: 'Certificados Digitales AEAT',
    content: `Para presentar declaraciones tributarias ante la AEAT es necesario un certificado digital.
Tipos aceptados:
- DNIe (DNI electrónico).
- Certificado FNMT (Fábrica Nacional de Moneda y Timbre).
- Certificado de la Real Casa de la Moneda.
- Cl@ve PIN (para personas físicas).
Formato: archivo P12 o PFX protegido por contraseña.
En Volkern puedes subir tu certificado P12/PFX en Configuración > Fiscal > Emisores para presentar declaraciones automáticamente.`,
    category: 'FISCAL',
    tags: ['certificado', 'digital', 'AEAT', 'P12', 'PFX', 'FNMT', 'fiscal'],
  },
]

export async function seedKnowledgeBase(tenantId: string, authorId: string) {
  const { prisma } = await import('@/lib/db')
  let created = 0
  let embeddingsGenerated = 0

  for (const article of ACCOUNTING_ARTICLES) {
    const existing = await prisma.knowledgeArticle.findFirst({
      where: { tenantId, title: article.title },
    })

    if (!existing) {
      // Usar KnowledgeService.createArticle para generar embeddings automáticamente
      const createdArticle = await KnowledgeService.createArticle(tenantId, {
        ...article,
        authorId,
        isPublic: true,
      })

      if (createdArticle.vectorId) {
        embeddingsGenerated++
      }
      created++
    }
  }

  console.log(`[SeedKB] Creados ${created} artículos (${embeddingsGenerated} con embeddings)`)
  return created
}

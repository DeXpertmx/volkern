import { parseInvoiceText, VisionResult } from '../lib/invoice-parser'

let passed = 0
let failed = 0

function assert(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected
  const status = pass ? '✅' : '❌'
  console.log(`${status} ${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (pass) passed++
  else failed++
}

function testInvoice1() {
  console.log('\n=== Factura 1: Innovatech ===')
  const ocrText = `INNOVATECH SOLUCIONES\tFACTURA\t
S.L.\t
Número de factura: F2026-00142\t
SERVICIOS TECNOI GGICOS Y CONSUIITORIA\t
Fecha de expedición: 24/07/2026\t
Fecha de operación: 20/07/2026\t
EMISOR (DATOS FISCALES)\tRECEPTOR (CLIENTE)\t
INNOVATECH SOLUCIONES S.L.\tD. Carlos Mendoza Gutiérrez\t
NIF / DNI: 123430/82\t
Calle Gran Via, 45, Planta 3ª\tAvenida de la Constitución, 12, 2 B\t
28013 Madrid, España\t41001 Sevilla, España\t
Registro Mercantil de Madrid, Tomo 1234, Folio 56,\tActividad: Profesional Autónomo\t
Hoja M-78901\tEmail: cmendoza@estudiocreativo.es\t
Contacto: contacto @innovatech.es\t
BASE\t
DESCRIPCIÓN DEL PRODUCTO / SERVICIO\tCANT. PRECIO UD. % IVA\t
IMPONIBLE\t
Desarrollo de Aplicación Web Medida\t
Fase 1: Diseño de arquitectura, frontend responsive e\t1.200,00 €\t21%\t1.200,00 €\t
Servicio de Mantenimiento y Cloud Hosting\t1\t150,00 €\t21%\t150,00 €\t
Suscripción mensual - Periodo Julio 2026.\t
Auditoria de Ciberseguridad y Optimización\t
SEO\t250,00 €\t21%\t250,00 €\t
web.\t
Informacion Legal y Hegimen Fiscal:\tBase Imponible Total:\t1.600,00 €\t
Factura emitida conforme al Real Decreto 1619/2012, de 30 de\t
noviembre, por el que se regula el reglamento de obligaciones\tIVA (21% sobre 1.600,00 €):\t336,00 €\t
de lacturación en España.\t
Retención IRPF (-15%)*:\t-240,00 €\t
Datos de Pago\tTOTAL A PAGAR:\t1.696,00 €\t
Forma de Pago: Transferencia Bancaria (Vencimiento: 15\t
"La retención de IRPF so aplica cuando el receptor es profesional\t
Hacienda (Modelo 111).\t
IBAN: ES91 0049 1234 56 1234567890\t
BIC/SWIFT: BSCHESMMXXX\t
Concepto: Factura F2026-00142 - Carlos Mendoza\t
Factura de Simulación de Ejemplo Cumplimiento Reglamento de Facturación (RD 1619/2012) — España\t`

  const result = parseInvoiceText(ocrText)

  if (!result) {
    console.error('Parser returned null')
    failed++
    return
  }

  assert('1.numero_factura', result.numero_factura, 'F2026-00142')
  assert('1.serie', result.serie, 'F2026')
  assert('1.fecha_emision', result.fecha_emision, '24/07/2026')
  assert('1.fecha_operacion', result.fecha_operacion, '20/07/2026')
  assert('1.emisor.nombre', result.emisor.nombre, 'INNOVATECH SOLUCIONES S.L.')
  assert('1.emisor.nif', result.emisor.nif, null)
  assert('1.emisor.direccion contains Calle Gran Via', result.emisor.direccion?.includes('Calle Gran Via'), true)
  assert('1.receptor.nombre', result.receptor.nombre, 'D. Carlos Mendoza Gutiérrez')
  assert('1.receptor.nif', result.receptor.nif, null)
  assert('1.totales.base_imponible', result.totales.base_imponible, 1600)
  assert('1.totales.tipo_iva', result.totales.tipo_iva, 21)
  assert('1.totales.cuota_iva', result.totales.cuota_iva, 336)
  assert('1.totales.tipo_irpf', result.totales.tipo_irpf, 15)
  assert('1.totales.cuota_irpf', result.totales.cuota_irpf, -240)
  assert('1.totales.total_factura', result.totales.total_factura, 1696)
  assert('1.iban', result.iban, 'ES9100491234561234567890')

  assert('1.lineas.length', result.lineas.length, 3)
  assert('1.lineas[0].descripcion', (result.lineas[0]?.descripcion ?? '').includes('Desarrollo de Aplicación Web'), true)
  assert('1.lineas[0].importe', result.lineas[0]?.importe, 1200)
  assert('1.lineas[1].descripcion', (result.lineas[1]?.descripcion ?? '').includes('Mantenimiento'), true)
  assert('1.lineas[1].importe', result.lineas[1]?.importe, 150)
  assert('1.lineas[2].descripcion', (result.lineas[2]?.descripcion ?? '').includes('Ciberseguridad'), true)
  assert('1.lineas[2].importe', result.lineas[2]?.importe, 250)
}

function testInvoice2() {
  console.log('\n=== Factura 2: Logística y Distribución ===')
  const ocrText = `LOGÍSTICA Y DISTRIBUCIÓN\tFACTURA ORDINARIA\t
DEL SUR S.L.U.\tSerie y N°:\tEXP2026-0894\t
NIF: B-91234567\tFecha Emisión:\t30/07/2026\t
Polígono Industrial Fuente Olmedo, Nave 14\tFecha Operación:\t28/07/2026\t
29004 Málaga, España\t
TIf: +34 952 11 22 33 | Email: facturacion@logisur.e.\tVencimiento:\t29/08/2026\t
Reg. Mercantil de Málaga, Tomo 4321, Libro 32, Folio 88, Hoja MA-9912:\t
DATOS DEL CLIENTE / RECEPTOR\tDIRECCIÓN DE ENTREGA / ENVÍO\t
COMERCIAL HOSTELERA MALAGUEÑA S.A.\tAlmacén Central - Comercial Hostelera\t
NIF / CIF: A-29876543\tAv. de Velázquez, 140|\t
Calle Larios, 8, 3° Izq\t29004 Málaga, España\t
29005 Málaga, España\tRef. Pedido Cliente: PED-2026-991\t
Persona de contacto: Laura Gómez\t
TOTAL\t
CÓDIGO\tDESCRIPCIÓN / PRODUCTO\tCANT.\tPRECIO/U.\tDTO %\t% IVA\t
NET.\t
Cajas de Cartón Ondulado Doble (Pack\t
ENV-0912\t50ud)\t10\t45,00 €\t10%\t21%\t405,00 €\t
Medidas: 60x40x40 cm - Alta resistencia\t
Palet Europeo Homologado EPAL\t
PAL-EU01\t18,50€\t0%\t21%\t92,50 €\t
Madera tratada HT / NIME 15\t
Bobina Film Estirable Transparente 23\t
ALM-FNB\tmicras\t12\t9,00 €\t5%\t21%\t102,60 €\t
Uso manual - Rollo 2.5 kg |\t
SER-TRN\tPorte y Transporte Mercancía Urbano\t60,00 €\t0%\t10%\t60,00 €\t
Servicio de entrega express 24h\t
DESGLOSE IMPOSITIVO POR TIPO DE IVA\t
Suma Importes Brutos:\t668,50 €\t
Tipo IVA\tBase Imponible\tCuota IVA\tDescuentos Aplicados:\t- 50,40€\t
21,00 %\t600,10 €\t126,02 €\tBase Imponible Total:\t
660,10 €\t
10,00 %\t60,00 €\t6,00 €\tTotal Impuestos (IVA):\t132,02 €\t
Retención IRPF (0% - Empresa):\t0,00 €\t
* Factura emitida en régimen general de IVA. Operación intracomunitaria/\t
TOTAL FACTURA:\t792,12 €\t
Condiciones y Modo de Pago:\t
Forma de pago: Remesa Bancaria SEPA / Domiciliación (30 días)\t
IBAN del Deudor: ES44 2100 9988 77 1234567891\t[ CÓDIGO QR 1\t
Entidad Emisora: CaixaBank S.A.\t
Observaciones: Rogamos incluyan el número de factura EXP2026-0894 en el\t
VERI*FACTU\t
concento\t`

  const result = parseInvoiceText(ocrText)

  if (!result) {
    console.error('Parser returned null')
    failed++
    return
  }

  assert('2.numero_factura', result.numero_factura, 'EXP2026-0894')
  assert('2.serie', result.serie, 'EXP2026')
  assert('2.fecha_emision', result.fecha_emision, '30/07/2026')
  assert('2.fecha_operacion', result.fecha_operacion, '28/07/2026')
  assert('2.emisor.nombre', result.emisor.nombre, 'LOGÍSTICA Y DISTRIBUCIÓN DEL SUR S.L.U.')
  assert('2.emisor.nif', result.emisor.nif, 'B91234567')
  assert('2.emisor.direccion contains Polígono', result.emisor.direccion?.includes('Polígono Industrial'), true)
  assert('2.receptor.nombre', result.receptor.nombre, 'COMERCIAL HOSTELERA MALAGUEÑA S.A.')
  assert('2.receptor.nif', result.receptor.nif, 'A29876543')
  assert('2.receptor.direccion contains Calle Larios', result.receptor.direccion?.includes('Calle Larios'), true)

  assert('2.totales.base_imponible', result.totales.base_imponible, 660.1)
  assert('2.totales.tipo_iva', result.totales.tipo_iva, 21)
  assert('2.totales.cuota_iva', result.totales.cuota_iva, 132.02)
  assert('2.totales.tipo_irpf', result.totales.tipo_irpf, 0)
  assert('2.totales.cuota_irpf', result.totales.cuota_irpf, 0)
  assert('2.totales.total_factura', result.totales.total_factura, 792.12)
  assert('2.iban', result.iban, 'ES4421009988771234567891')

  assert('2.lineas.length', result.lineas.length, 4)
  assert('2.lineas[0].descripcion', (result.lineas[0]?.descripcion ?? '').includes('Cajas de Cartón'), true)
  assert('2.lineas[0].cantidad', result.lineas[0]?.cantidad, 10)
  assert('2.lineas[0].importe', result.lineas[0]?.importe, 405)
  assert('2.lineas[1].descripcion', (result.lineas[1]?.descripcion ?? '').includes('Palet Europeo'), true)
  assert('2.lineas[1].importe', result.lineas[1]?.importe, 92.5)
  assert('2.lineas[2].descripcion', (result.lineas[2]?.descripcion ?? '').includes('Bobina Film'), true)
  assert('2.lineas[2].importe', result.lineas[2]?.importe, 102.6)
  assert('2.lineas[3].descripcion', (result.lineas[3]?.descripcion ?? '').includes('Porte y Transporte'), true)
  assert('2.lineas[3].importe', result.lineas[3]?.importe, 60)

  assert('2.desglose_iva length', result.totales.desglose_iva?.length, 2)
  assert('2.desglose_iva[0].tipo', result.totales.desglose_iva?.[0]?.tipo, 21)
  assert('2.desglose_iva[1].tipo', result.totales.desglose_iva?.[1]?.tipo, 10)
}

// Ejecutar tests
testInvoice1()
testInvoice2()

console.log(`\nPassed: ${passed}, Failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)

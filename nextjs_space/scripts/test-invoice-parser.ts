import { parseInvoiceText } from '../lib/invoice-parser'

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
Auditoria de Ciberseguridad y Optimización\nSEO\t250,00 €\t21%\t250,00 €\t
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
  assert('1.verifactu', result.verifactu, false)

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
  assert('2.verifactu', result.verifactu, true)

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

function testInvoice3() {
  console.log('\n=== Factura 3: Suministros Industriales ===')
  const ocrText = `SUMINISTROS INDUSTRIALES VALENCIA C.B.	
NIF: E-987654321	
Av. Ausiàs March, 88 - 46026 Valencia (España)	
Tel: 96 300 11 22 | TPV Caja #04	
FACTURA SIMPLIFICADA	
N° Factura: FS2026/045892	Fecha: 30/07/2026	
Hora: 14:32:05	Atendido por: Vendedor #12	
Cliente Identificado: TALLERES MECÁNICOS LEVANTE S.L.	
NIF Cliente: B-46112233	
DESCRIPCIÓN	CANT	P.UNIT	TOTAL	
Aceite Sintético 5W30 5L	2,00	32,50 €	65,00 €	
Filtro de Aire Universal X2	1,00	14,20 €	14, 20 €	
Juego Pastillas Freno Del.	1,00	48,00 €	48, 00 €	
Líquido de Frenos DOT4 1L	3,00	6,10	€	18,30	€	
Base Imponible (21%):	120, 25 €	
Cuota IVA (21%):	25,25 €	
Retención IRPF (%):	0,00 €	
TOTAL IMPORTE:	145,50 €	
Forma de Pago: Tarjeta de Crédito (Visa ****8841)	
Estado: PAGADO	
QR AEAT	
VERI*FACTU	
Factura verificable en la sede electrónica de la AEAT	`

  const result = parseInvoiceText(ocrText)

  if (!result) {
    console.error('Parser returned null')
    failed++
    return
  }

  assert('3.numero_factura', result.numero_factura, 'FS2026/045892')
  assert('3.serie', result.serie, 'FS2026')
  assert('3.fecha_emision', result.fecha_emision, '30/07/2026')
  assert('3.fecha_operacion', result.fecha_operacion, null)
  assert('3.emisor.nombre', result.emisor.nombre, 'SUMINISTROS INDUSTRIALES VALENCIA C.B.')
  assert('3.emisor.nif', result.emisor.nif, 'E987654321')
  assert('3.emisor.direccion contains Ausiàs', result.emisor.direccion?.includes('Ausiàs March'), true)
  assert('3.receptor.nombre', result.receptor.nombre, 'TALLERES MECÁNICOS LEVANTE S.L.')
  assert('3.receptor.nif', result.receptor.nif, 'B46112233')

  assert('3.totales.base_imponible', result.totales.base_imponible, 120.25)
  assert('3.totales.tipo_iva', result.totales.tipo_iva, 21)
  assert('3.totales.cuota_iva', result.totales.cuota_iva, 25.25)
  assert('3.totales.tipo_irpf', result.totales.tipo_irpf, 0)
  assert('3.totales.cuota_irpf', result.totales.cuota_irpf, 0)
  assert('3.totales.total_factura', result.totales.total_factura, 145.5)
  assert('3.verifactu', result.verifactu, true)

  assert('3.lineas.length', result.lineas.length, 4)
  assert('3.lineas[0].descripcion', (result.lineas[0]?.descripcion ?? '').includes('Aceite Sintético'), true)
  assert('3.lineas[0].cantidad', result.lineas[0]?.cantidad, 2)
  assert('3.lineas[0].precio_unitario', result.lineas[0]?.precio_unitario, 32.5)
  assert('3.lineas[0].importe', result.lineas[0]?.importe, 65)
  assert('3.lineas[1].descripcion', (result.lineas[1]?.descripcion ?? '').includes('Filtro de Aire'), true)
  assert('3.lineas[1].cantidad', result.lineas[1]?.cantidad, 1)
  assert('3.lineas[1].precio_unitario', result.lineas[1]?.precio_unitario, 14.2)
  assert('3.lineas[2].descripcion', (result.lineas[2]?.descripcion ?? '').includes('Juego Pastillas'), true)
  assert('3.lineas[2].cantidad', result.lineas[2]?.cantidad, 1)
  assert('3.lineas[2].precio_unitario', result.lineas[2]?.precio_unitario, 48)
  assert('3.lineas[3].descripcion', (result.lineas[3]?.descripcion ?? '').includes('Líquido de Frenos'), true)
  assert('3.lineas[3].cantidad', result.lineas[3]?.cantidad, 3)
  assert('3.lineas[3].precio_unitario', result.lineas[3]?.precio_unitario, 6.1)
}

function testInvoice4() {
  console.log('\n=== Factura 4: Nexus Consulting ===')
  const ocrText = `NEXUS CONSULTING S.L.	FACTURA	
Servicios Tecnológicos y Asesoría Digital	N° NX-2026-0891	
EMISOR	CLIENTE	
NEXUS CONSULTING S.L.	LOGÍSTICA INTEGRAL DEL SUR S.A.	
NIF: B-87654321	NIF: A-41009988	
Paseo de la Castellana, 140, Planta 8	Av. de la Industria, Parc. 14	
28046 Madrid (España)	41007 Sevilla (España)	
Email: facturacion@nexusconsulting.es	Attn: Depto. de Contabilidad	
DATOS DE EMISIÓN	DETALLES DEL PEDIDO	
Fecha Emisión: 15/08/2026	Ref. Contrato: CNT-2026-042	
Fecha Vencimiento: 14/09/2026	Forma de Pago: Transferencia 30 días	
CONCEPTO / DESCRIPCIÓN	HORAS	PRECIO / HORA	TOTAL	
Auditoría de Seguridad e Infraestructura Cloud	
Análisis de vulnerabilidades y optimización de costes AWS	25,00	85,00€	2.125,00 €	
(Fase I)	
Desarrollo de API para Integración ERP	
Implementación de conectores REST para sincronización de	40,00	75,00 €	3.000,00 €	
stock	
Mantenimiento y Soporte Técnico Mensual	1,00	650,00 €	650,00 €	
SLA 24/7 correspondiente al periodo de Julio 2026	
Base Imponible:	5.775,00 €	
Información de Pago:	
Banco: Banco Santander	IVA (21%):	1.212,75 €	
IBAN: ES91 0049 1500 0512 3456 7890	
BIC/SWIFT: BSANESMMXXX	Retención IRPF (0%):	0,00 €	
Por favor, indique el N° de Factura (NX-2026-0891) en el concepto.	
TOTAL FACTURA:	6.987,75 €	
VERI*FACTU	
Factura verificable en la sede electrónica de la AEAT	`

  const result = parseInvoiceText(ocrText)

  if (!result) {
    console.error('Parser returned null')
    failed++
    return
  }

  assert('4.numero_factura', result.numero_factura, 'NX-2026-0891')
  assert('4.serie', result.serie, 'NX')
  assert('4.fecha_emision', result.fecha_emision, '15/08/2026')
  assert('4.fecha_operacion', result.fecha_operacion, null)
  assert('4.emisor.nombre', result.emisor.nombre, 'NEXUS CONSULTING S.L.')
  assert('4.emisor.nif', result.emisor.nif, 'B87654321')
  assert('4.emisor.direccion contains Castellana', result.emisor.direccion?.includes('Castellana'), true)
  assert('4.receptor.nombre', result.receptor.nombre, 'LOGÍSTICA INTEGRAL DEL SUR S.A.')
  assert('4.receptor.nif', result.receptor.nif, 'A41009988')
  assert('4.receptor.direccion contains Industria', result.receptor.direccion?.includes('Industria'), true)

  assert('4.totales.base_imponible', result.totales.base_imponible, 5775)
  assert('4.totales.tipo_iva', result.totales.tipo_iva, 21)
  assert('4.totales.cuota_iva', result.totales.cuota_iva, 1212.75)
  assert('4.totales.tipo_irpf', result.totales.tipo_irpf, 0)
  assert('4.totales.cuota_irpf', result.totales.cuota_irpf, 0)
  assert('4.totales.total_factura', result.totales.total_factura, 6987.75)
  assert('4.iban', result.iban, 'ES9100491500051234567890')
  assert('4.verifactu', result.verifactu, true)

  assert('4.lineas.length', result.lineas.length, 3)
  assert('4.lineas[0].descripcion', (result.lineas[0]?.descripcion ?? '').includes('Auditoría de Seguridad'), true)
  assert('4.lineas[0].cantidad', result.lineas[0]?.cantidad, 25)
  assert('4.lineas[0].precio_unitario', result.lineas[0]?.precio_unitario, 85)
  assert('4.lineas[0].importe', result.lineas[0]?.importe, 2125)
  assert('4.lineas[1].descripcion', (result.lineas[1]?.descripcion ?? '').includes('Desarrollo de API'), true)
  assert('4.lineas[1].cantidad', result.lineas[1]?.cantidad, 40)
  assert('4.lineas[1].precio_unitario', result.lineas[1]?.precio_unitario, 75)
  assert('4.lineas[2].descripcion', (result.lineas[2]?.descripcion ?? '').includes('Mantenimiento y Soporte'), true)
  assert('4.lineas[2].cantidad', result.lineas[2]?.cantidad, 1)
  assert('4.lineas[2].precio_unitario', result.lineas[2]?.precio_unitario, 650)
}

// Ejecutar tests
testInvoice1()
testInvoice2()
testInvoice3()
testInvoice4()

console.log(`\nPassed: ${passed}, Failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)

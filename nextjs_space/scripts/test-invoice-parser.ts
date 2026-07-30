import { parseInvoiceText } from '../lib/invoice-parser'

const ocrText = `INNOVATECH SOLUCIONES	FACTURA	
S.L.	
Número de factura: F2026-00142	
SERVICIOS TECNOI GGICOS Y CONSUIITORIA	
Fecha de expedición: 24/07/2026	
Fecha de operación: 20/07/2026	
EMISOR (DATOS FISCALES)	RECEPTOR (CLIENTE)	
INNOVATECH SOLUCIONES S.L.	D. Carlos Mendoza Gutiérrez	
NIF / DNI: 123430/82	
Calle Gran Via, 45, Planta 3ª	Avenida de la Constitución, 12, 2 B	
28013 Madrid, España	41001 Sevilla, España	
Registro Mercantil de Madrid, Tomo 1234, Folio 56,	Actividad: Profesional Autónomo	
Hoja M-78901	Email: cmendoza@estudiocreativo.es	
Contacto: contacto @innovatech.es	
BASE	
DESCRIPCIÓN DEL PRODUCTO / SERVICIO	CANT. PRECIO UD. % IVA	
IMPONIBLE	
Desarrollo de Aplicación Web Medida	
Fase 1: Diseño de arquitectura, frontend responsive e	1.200,00 €	21%	1.200,00 €	
Servicio de Mantenimiento y Cloud Hosting	1	150,00 €	21%	150,00 €	
Suscripción mensual - Periodo Julio 2026.	
Auditoria de Ciberseguridad y Optimización	
SEO	
250,00 €	21%	250,00 €	
web.	
Informacion Legal y Hegimen Fiscal:	Base Imponible Total:	1.600,00 €	
Factura emitida conforme al Real Decreto 1619/2012, de 30 de	
noviembre, por el que se regula el reglamento de obligaciones	IVA (21% sobre 1.600,00 €):	336,00 €	
de lacturación en España.	
Retención IRPF (-15%)*:	-240,00 €	
Datos de Pago	TOTAL A PAGAR:	1.696,00 €	
Forma de Pago: Transferencia Bancaria (Vencimiento: 15	
"La retención de IRPF so aplica cuando el receptor es profesional	
Hacienda (Modelo 111).	
IBAN: ES91 0049 1234 56 1234567890	
BIC/SWIFT: BSCHESMMXXX	
Concepto: Factura F2026-00142 - Carlos Mendoza	
Factura de Simulación de Ejemplo Cumplimiento Reglamento de Facturación (RD 1619/2012) — España	`

const result = parseInvoiceText(ocrText)

if (!result) {
  console.error('Parser returned null')
  process.exit(1)
}

function check(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected
  const status = pass ? '✅' : '❌'
  console.log(`${status} ${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  return pass
}

let passed = 0
let failed = 0

function assert(label: string, actual: unknown, expected: unknown) {
  if (check(label, actual, expected)) passed++
  else failed++
}

assert('numero_factura', result.numero_factura, 'F2026-00142')
assert('serie', result.serie, 'F2026')
assert('fecha_emision', result.fecha_emision, '24/07/2026')
assert('fecha_operacion', result.fecha_operacion, '20/07/2026')
assert('emisor.nombre', result.emisor.nombre, 'INNOVATECH SOLUCIONES S.L.')
assert('emisor.nif', result.emisor.nif, null) // OCR lo leyó como "123430/82", no es NIF válido
assert('emisor.direccion contains Calle Gran Via', result.emisor.direccion?.includes('Calle Gran Via'), true)
assert('receptor.nombre', result.receptor.nombre, 'D. Carlos Mendoza Gutiérrez')
assert('receptor.nif', result.receptor.nif, null) // OCR no capturó el NIF del receptor
assert('totales.base_imponible', result.totales.base_imponible, 1600)
assert('totales.tipo_iva', result.totales.tipo_iva, 21)
assert('totales.cuota_iva', result.totales.cuota_iva, 336)
assert('totales.tipo_irpf', result.totales.tipo_irpf, 15)
assert('totales.cuota_irpf', result.totales.cuota_irpf, -240)
assert('totales.total_factura', result.totales.total_factura, 1696)
assert('iban', result.iban, 'ES9100491234561234567890')

// Líneas de detalle
assert('lineas.length', result.lineas.length, 3)
assert('lineas[0].descripcion', (result.lineas[0]?.descripcion ?? '').includes('Desarrollo de Aplicación Web'), true)
assert('lineas[0].cantidad', result.lineas[0]?.cantidad, 1)
assert('lineas[0].precio_unitario', result.lineas[0]?.precio_unitario, 1200)
assert('lineas[0].importe', result.lineas[0]?.importe, 1200)
assert('lineas[1].descripcion', (result.lineas[1]?.descripcion ?? '').includes('Mantenimiento'), true)
assert('lineas[1].importe', result.lineas[1]?.importe, 150)
assert('lineas[2].descripcion', (result.lineas[2]?.descripcion ?? '').includes('Ciberseguridad'), true)
assert('lineas[2].importe', result.lineas[2]?.importe, 250)

console.log('\nResultado completo:')
console.log(JSON.stringify(result, null, 2))
console.log(`\nPassed: ${passed}, Failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)

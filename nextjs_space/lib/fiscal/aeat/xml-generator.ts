import { AEAT_CONFIG } from './config';

/**
 * Generador de XML para AEAT Veri*factu
 */
export class AEATXmlGenerator {
  
  static generateAltaFactura(data: {
    emisor: { nif: string, nombre: string },
    receptor: { nif: string, nombre: string },
    factura: {
      numero: string,
      fecha: string,
      monto: number,
      moneda: string
    },
    encadenamiento: {
      fingerprintAnterior?: string
    }
  }) {
    const { emisor, receptor, factura, encadenamiento } = data;
    
    // Estructura simplificada cumpliendo con el esquema SuministroInformacion.xsd
    const xml = `
<vfact:RegistroFactura xmlns:vfact="${AEAT_CONFIG.namespaces.vfact}">
  <vfact:IDFactura>
    <vfact:IDEmisorFactura>${emisor.nif}</vfact:IDEmisorFactura>
    <vfact:NumSerieFactura>${factura.numero}</vfact:NumSerieFactura>
    <vfact:FechaExpedicionFactura>${factura.fecha.split('T')[0]}</vfact:FechaExpedicionFactura>
  </vfact:IDFactura>
  <vfact:Emisor>
    <vfact:NIF>${emisor.nif}</vfact:NIF>
    <vfact:NombreRazon>${emisor.nombre}</vfact:NombreRazon>
  </vfact:Emisor>
  <vfact:Receptor>
    <vfact:NIF>${receptor.nif}</vfact:NIF>
    <vfact:NombreRazon>${receptor.nombre}</vfact:NombreRazon>
  </vfact:Receptor>
  <vfact:DetalleFactura>
    <vfact:ImporteTotal>${factura.monto.toFixed(2)}</vfact:ImporteTotal>
    <vfact:Moneda>${factura.moneda}</vfact:Moneda>
  </vfact:DetalleFactura>
  <vfact:Encadenamiento>
    <vfact:FingerprintAnterior>${encadenamiento.fingerprintAnterior || 'GENESIS_VERIFACTU_2026'}</vfact:FingerprintAnterior>
  </vfact:Encadenamiento>
  <vfact:SistemaInformatico>
    <vfact:NombreSistema>Volkern OS</vfact:NombreSistema>
    <vfact:Version>1.0.0</vfact:Version>
  </vfact:SistemaInformatico>
</vfact:RegistroFactura>
    `.trim();

    return xml;
  }
}

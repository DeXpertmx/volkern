/**
 * Configuración de Endpoints y Namespaces para AEAT Veri*factu
 */

const isProduction = process.env.NODE_ENV === 'production' && process.env.AEAT_ENV === 'production';

export const AEAT_CONFIG = {
  // Endpoints Dinámicos
  endpoints: {
    alta: isProduction 
      ? 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/TiketBai/VerifactuSOAP'
      : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/TiketBai/VerifactuSOAP'
  },

  // Namespaces requeridos por el esquema TicketBai / Verifactu
  namespaces: {
    vfact: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd',
    ds: 'http://www.w3.org/2000/09/xmldsig#',
    xades: 'http://uri.etsi.org/01903/v1.3.2#'
  },

  // Algoritmos de firma
  algorithms: {
    signature: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digest: 'http://www.w3.org/2001/04/xmlenc#sha256',
    canonicalization: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  }
};

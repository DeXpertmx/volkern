import * as https from 'https';
// @ts-ignore - no declaration file for node-forge
import * as forge from 'node-forge';
import { AEAT_CONFIG } from './config';

/**
 * Cliente SOAP para AEAT con soporte de Mutual TLS (Certificado X.509)
 */
export class AEATClient {
  
  /**
   * Envía el XML firmado a la AEAT vía SOAP
   */
  static async sendSoap(xmlSigned: string, p12Base64: string, password: string): Promise<string> {
    const p12Der = Buffer.from(p12Base64, 'base64').toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    
    // Extraer clave y certificado para el Agent de HTTPS (MTLS)
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];

    if (!keyBag?.key || !certBag?.cert) {
      throw new Error('Certificado inválido para MTLS');
    }

    const keyPem = forge.pki.privateKeyToPem(keyBag.key);
    const certPem = forge.pki.certificateToPem(certBag.cert);

    // Envoltorio SOAP
    const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    ${xmlSigned}
  </soapenv:Body>
</soapenv:Envelope>
    `.trim();

    const agent = new https.Agent({
      key: keyPem,
      cert: certPem,
      rejectUnauthorized: false // En sandbox a veces los certs de la AEAT no son reconocidos
    });

    return new Promise((resolve, reject) => {
      const url = new URL(AEAT_CONFIG.endpoints.alta);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'Content-Length': Buffer.byteLength(soapEnvelope),
          'SOAPAction': '' // Requerido por algunos servicios
        },
        agent: agent
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Error AEAT (${res.statusCode}): ${data}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(soapEnvelope);
      req.end();
    });
  }
}

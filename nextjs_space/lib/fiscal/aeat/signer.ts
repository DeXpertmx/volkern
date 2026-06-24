import * as crypto from 'crypto';
// @ts-ignore - xmldom no tiene tipos
import { DOMParser, XMLSerializer } from 'xmldom';
import { SignedXml } from 'xml-crypto';
// @ts-ignore - node-forge no tiene tipos
import * as forge from 'node-forge';
import { AEAT_CONFIG } from './config';

/**
 * Servicio de Firma XML para AEAT (XAdES-BES)
 */
export class AEATSigner {
  
  /**
   * Firma un XML siguiendo el estándar XAdES-BES requerido por AEAT
   */
  static async signXml(xmlString: string, p12Base64: string, password: string): Promise<string> {
    try {
      // 1. Cargar certificado P12
      const p12Der = Buffer.from(p12Base64, 'base64').toString('binary');
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
      
      // Obtener clave privada y certificado
      const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keyBag = bags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      
      if (!keyBag?.key || !certBag?.cert) {
        throw new Error('No se pudo extraer la clave privada o el certificado del archivo P12');
      }

      const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
      const certPem = forge.pki.certificateToPem(certBag.cert);
      const certBase64 = certPem
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, '');

      // 3. Preparar el firmador (xml-crypto)
      const sig = new SignedXml();
      const signatureId = `Signature-${Date.now()}`;
      const signedPropertiesId = `SignedProperties-${Date.now()}`;
      
      // Configuración AEAT
      sig.signatureAlgorithm = AEAT_CONFIG.algorithms.signature;
      sig.canonicalizationAlgorithm = AEAT_CONFIG.algorithms.canonicalization;
      
      // Referencia al documento completo
      (sig as any).addReference(
        "//*[local-name(.)='RegistroFactura']",
        [AEAT_CONFIG.algorithms.canonicalization],
        AEAT_CONFIG.algorithms.digest,
        "",
        "",
        "",
        true
      );

      // 4. Agregar Propiedades XAdES (Simplificado para BES)
      const signingTime = new Date().toISOString();
      const xadesObject = `
<ds:Object xmlns:ds="${AEAT_CONFIG.namespaces.ds}">
  <xades:QualifyingProperties xmlns:xades="${AEAT_CONFIG.namespaces.xades}" Target="#${signatureId}">
    <xades:SignedProperties Id="${signedPropertiesId}">
      <xades:SignedGeneralProperties>
        <xades:SigningTime>${signingTime}</xades:SigningTime>
      </xades:SignedGeneralProperties>
    </xades:SignedProperties>
  </xades:QualifyingProperties>
</ds:Object>`.trim();

      // Referencia a las propiedades firmadas
      (sig as any).addReference(
        `//*[@Id='${signedPropertiesId}']`,
        [AEAT_CONFIG.algorithms.canonicalization],
        AEAT_CONFIG.algorithms.digest
      );

      // 5. Insertar KeyInfo (Certificado)
      (sig as any).keyInfoProvider = {
        getKeyInfo: () => {
          return `<ds:X509Data><ds:X509Certificate>${certBase64}</ds:X509Certificate></ds:X509Data>`;
        },
        getKey: () => Buffer.from(privateKeyPem)
      };

      // 6. Firmar
      sig.computeSignature(xmlString, {
        location: { reference: "//*[local-name(.)='RegistroFactura']", action: "append" },
        prefix: 'ds'
      });

      const signedXml = sig.getSignedXml();
      const xadesSignedXml = signedXml.replace('</ds:Signature>', `${xadesObject}</ds:Signature>`);
      
      return {
        xml: xadesSignedXml,
        certFingerprint: forge.md.sha256.create().update(certBase64).digest().toHex(),
        expiresAt: certBag.cert.validity.notAfter
      } as any;
    } catch (error: any) {
      console.error('Error al firmar XML:', error);
      throw new Error(`Falla en firma XAdES: ${error.message}`);
    }
  }

  /**
   * Agrega un Sello de Tiempo (Timestamp) para cumplir con XAdES-T (Auditoría Legal)
   */
  static async addTimestamp(signedXml: string): Promise<string> {
    const timestampId = `TS-${Date.now()}`;
    // En producción, aquí se llamaría a una TSA (RFC 3161)
    const mockToken = Buffer.from(`TSA_PROOF_${new Date().toISOString()}`).toString('base64');

    const xadesT = `
      <xades:UnsignedProperties>
        <xades:UnsignedSignatureProperties>
          <xades:SignatureTimeStamp Id="${timestampId}">
            <ds:CanonicalizationMethod Algorithm="${AEAT_CONFIG.algorithms.canonicalization}"/>
            <xades:EncapsulatedTimeStamp>${mockToken}</xades:EncapsulatedTimeStamp>
          </xades:SignatureTimeStamp>
        </xades:UnsignedSignatureProperties>
      </xades:UnsignedProperties>
    `.trim();

    return signedXml.replace('</xades:QualifyingProperties>', `${xadesT}</xades:QualifyingProperties>`);
  }

  /**
   * MOCK para testing cuando no hay certificado real
   */
  static mockSign(xmlString: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const signatureMock = `
<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    <ds:Reference URI="">
      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <ds:DigestValue>MOCK_DIGEST_VALUE</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>MOCK_SIGNATURE_VALUE</ds:SignatureValue>
</ds:Signature>`.trim();
    
    const sigDoc = parser.parseFromString(signatureMock, 'text/xml');
    doc.documentElement.appendChild(sigDoc.documentElement);
    
    return new XMLSerializer().serializeToString(doc);
  }
}

import { Decimal } from 'decimal.js'
import { PayrollSealer } from './payroll-sealer'

export class SEPAGenerator {
  /**
   * Genera el archivo XML SEPA (ISO 20022 pain.001.001.03) para pagos masivos
   */
  static async generatePayrollSEPA(tenantData: any, payrolls: any[], bankSchema: 'STANDARD' | 'CAIXA' | 'SANTANDER' = 'STANDARD') {
    // 0. Bloqueo por Integridad
    for (const p of payrolls) {
      const integrity = await PayrollSealer.verifyIntegrity(p.id)
      if (integrity !== 'VALID') throw new Error(`BLOQUEO_SEGURIDAD: Nómina ${p.id} comprometida (${integrity})`)
    }

    const msgId = `VOLKERN-PAYROLL-${Date.now()}`
    
    // Validación de importes al céntimo (Redondeo Bancario)
    const totalAmount = payrolls.reduce((acc, p) => {
      const net = new Decimal(p.netTotal.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      return acc.plus(net)
    }, new Decimal(0))
    
    // Matriz de esquemas bancarios específicos (ej. prefijos de ID o tags adicionales)
    const schemaConfig = {
      STANDARD: { idPrefix: 'VOLK' },
      CAIXA: { idPrefix: 'CABK' },
      SANTANDER: { idPrefix: 'SANT' }
    }[bankSchema]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${schemaConfig.idPrefix}-${msgId}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>${payrolls.length}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${tenantData.razonSocial}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PAYROLL-${new Date().toISOString().substring(0, 10)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <ReqdExctnDt>${new Date().toISOString().substring(0, 10)}</ReqdExctnDt>
      <Dbtr>
        <Nm>${tenantData.razonSocial}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id><IBAN>${tenantData.iban?.replace(/\s/g, '')}</IBAN></Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId><BIC>${tenantData.bic?.replace(/\s/g, '')}</BIC></FinInstnId>
      </DbtrAgt>
      ${payrolls.map(p => this.generateTransactionXML(p)).join('')}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`

    return xml
  }

  private static generateTransactionXML(p: any) {
    return `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${p.id}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${new Decimal(p.netTotal.toString()).toFixed(2)}</InstdAmt></Amt>
        <Cdtr>
          <Nm>${p.employee.fullName}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id><IBAN>${p.employee.bankAccount || 'ES0000000000000000000000'}</IBAN></Id>
        </CdtrAcct>
        <RmtInf><Ustrd>NOMINA ${p.period}</Ustrd></RmtInf>
      </CdtTrfTxInf>`
  }
}

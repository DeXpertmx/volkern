import { SourceTemplate } from '../import-types'

export const sageClientsTemplate: SourceTemplate = {
  name: 'Sage Clientes',
  source: 'sage',
  type: 'clients',
  columns: [
    { key: 'nombre', label: 'Nombre', required: true, aliases: ['nombre_razon_social', 'name', 'cliente', 'razon_social', 'razonsocial'] },
    { key: 'nif', label: 'NIF', required: true, aliases: ['nif_cif', 'cif', 'dni', 'tax_id', 'vat', 'vat_id', 'identificacion'] },
    { key: 'email', label: 'Email', required: false, aliases: ['e_mail', 'correo', 'email_address', 'mail'] },
    { key: 'telefono', label: 'Teléfono', required: false, aliases: ['telefono', 'phone', 'tel', 'phone_number', 'movil', 'movil1'] },
    { key: 'direccion', label: 'Dirección', required: false, aliases: ['direccion', 'address', 'calle', 'domicilio'] },
    { key: 'codigo_postal', label: 'Código Postal', required: false, aliases: ['codigo_postal', 'cp', 'zip', 'postal_code', 'codigopostal'] },
    { key: 'ciudad', label: 'Ciudad', required: false, aliases: ['ciudad', 'city', 'poblacion'] },
    { key: 'provincia', label: 'Provincia', required: false, aliases: ['provincia', 'province', 'state'] },
    { key: 'pais', label: 'País', required: false, aliases: ['pais', 'country'] },
    { key: 'codigo_cliente', label: 'Código Cliente', required: false, aliases: ['codigo', 'code', 'id_cliente', 'codcliente'] },
  ],
  detect: (headers: string[]) => {
    const norm = headers.map(h => h.toLowerCase())
    return norm.some(h => h.includes('nif') || h.includes('cif')) &&
           norm.some(h => h.includes('nombre') || h.includes('razon'))
  },
}

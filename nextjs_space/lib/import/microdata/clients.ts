import { SourceTemplate } from '../import-types'

export const microdataClientsTemplate: SourceTemplate = {
  name: 'Microdata Clientes',
  source: 'microdata',
  type: 'clients',
  columns: [
    { key: 'nombre', label: 'Nombre', required: true, aliases: ['nombre_razon_social', 'name', 'cliente', 'razon_social', 'apellidos_nombre'] },
    { key: 'nif', label: 'NIF', required: true, aliases: ['nif_cif', 'cif', 'dni', 'identificacion', 'nif_dni'] },
    { key: 'email', label: 'Email', required: false, aliases: ['e_mail', 'correo', 'email_address', 'mail', 'direccion_email'] },
    { key: 'telefono', label: 'Teléfono', required: false, aliases: ['telefono', 'phone', 'tel', 'telefono_1'] },
    { key: 'direccion', label: 'Dirección', required: false, aliases: ['direccion', 'address', 'calle', 'domicilio', 'tipo_via'] },
    { key: 'codigo_postal', label: 'Código Postal', required: false, aliases: ['codigo_postal', 'cp', 'zip', 'cod_postal'] },
    { key: 'ciudad', label: 'Ciudad', required: false, aliases: ['ciudad', 'city', 'poblacion', 'localidad'] },
    { key: 'provincia', label: 'Provincia', required: false, aliases: ['provincia', 'province'] },
    { key: 'codigo_cliente', label: 'Código Cliente', required: false, aliases: ['codigo', 'code', 'cod_cliente', 'num_cliente'] },
  ],
  detect: (headers: string[]) => {
    const norm = headers.map(h => h.toLowerCase())
    return norm.some(h => h.includes('nif') || h.includes('dni')) &&
           norm.some(h => h.includes('cliente'))
  },
}

// Biblioteca de validación de identificadores fiscales por país
// Incluye: RFC (México), NIF/CIF (España), EIN (EE.UU.), RUT (Chile), CUIT (Argentina), etc.

export interface FiscalIdConfig {
  pais: string;
  paisNombre: string;
  tipoId: string;
  tipoIdNombre: string;
  regex: RegExp;
  mascara: string; // Formato de máscara para UI (X = letra, 9 = número)
  ejemplo: string;
  descripcion: string;
  validacion?: (id: string) => boolean; // Validación adicional (dígitos de control)
}

// Configuraciones de IDs fiscales por país
export const FISCAL_ID_CONFIGS: FiscalIdConfig[] = [
  // México - RFC
  {
    pais: 'MX',
    paisNombre: 'México',
    tipoId: 'RFC',
    tipoIdNombre: 'Registro Federal de Contribuyentes',
    regex: /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/i,
    mascara: 'XXXX999999XXX',
    ejemplo: 'XAXX010101000',
    descripcion: '3-4 letras + 6 dígitos (fecha) + 3 caracteres (homoclave)',
    validacion: (id: string) => {
      // Validación básica de RFC mexicano
      const cleaned = id.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '');
      if (cleaned.length !== 12 && cleaned.length !== 13) return false;
      
      // Validar que los dígitos 5-10 sean una fecha válida
      const year = parseInt(cleaned.substring(cleaned.length - 9, cleaned.length - 7));
      const month = parseInt(cleaned.substring(cleaned.length - 7, cleaned.length - 5));
      const day = parseInt(cleaned.substring(cleaned.length - 5, cleaned.length - 3));
      
      return month >= 1 && month <= 12 && day >= 1 && day <= 31;
    }
  },
  
  // España - NIF/CIF/NIE
  {
    pais: 'ES',
    paisNombre: 'España',
    tipoId: 'NIF',
    tipoIdNombre: 'Número de Identificación Fiscal (Personas)',
    regex: /^[0-9]{8}[A-Z]$/i,
    mascara: '99999999X',
    ejemplo: '12345678Z',
    descripcion: '8 dígitos + 1 letra de control',
    validacion: (id: string) => {
      const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
      const cleaned = id.toUpperCase();
      const numero = parseInt(cleaned.substring(0, 8));
      const letra = cleaned.charAt(8);
      return letras.charAt(numero % 23) === letra;
    }
  },
  {
    pais: 'ES',
    paisNombre: 'España',
    tipoId: 'CIF',
    tipoIdNombre: 'Código de Identificación Fiscal (Empresas)',
    regex: /^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/i,
    mascara: 'X9999999X',
    ejemplo: 'B12345678',
    descripcion: '1 letra (tipo sociedad) + 7 dígitos + 1 dígito/letra control',
    validacion: (id: string) => {
      const cleaned = id.toUpperCase();
      const letra = cleaned.charAt(0);
      if (!'ABCDEFGHJKLMNPQRSUVW'.includes(letra)) return false;
      
      // Calcular dígito de control
      const digitos = cleaned.substring(1, 8);
      let sumaPares = 0;
      let sumaImpares = 0;
      
      for (let i = 0; i < 7; i++) {
        const digito = parseInt(digitos.charAt(i));
        if (i % 2 === 0) {
          const doble = digito * 2;
          sumaImpares += Math.floor(doble / 10) + (doble % 10);
        } else {
          sumaPares += digito;
        }
      }
      
      const total = sumaPares + sumaImpares;
      const control = (10 - (total % 10)) % 10;
      const ultimoCaracter = cleaned.charAt(8);
      
      // El control puede ser número o letra según el tipo
      if ('KPQS'.includes(letra)) {
        return ultimoCaracter === 'JABCDEFGHI'.charAt(control);
      } else if ('ABEH'.includes(letra)) {
        return parseInt(ultimoCaracter) === control;
      } else {
        return parseInt(ultimoCaracter) === control || ultimoCaracter === 'JABCDEFGHI'.charAt(control);
      }
    }
  },
  {
    pais: 'ES',
    paisNombre: 'España',
    tipoId: 'NIE',
    tipoIdNombre: 'Número de Identidad de Extranjero',
    regex: /^[XYZ][0-9]{7}[A-Z]$/i,
    mascara: 'X9999999X',
    ejemplo: 'X1234567L',
    descripcion: 'X/Y/Z + 7 dígitos + 1 letra de control',
    validacion: (id: string) => {
      const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
      const cleaned = id.toUpperCase();
      let numero = cleaned.substring(1, 8);
      
      // Reemplazar primera letra por número
      const primeraLetra = cleaned.charAt(0);
      if (primeraLetra === 'X') numero = '0' + numero;
      else if (primeraLetra === 'Y') numero = '1' + numero;
      else if (primeraLetra === 'Z') numero = '2' + numero;
      
      const letra = cleaned.charAt(8);
      return letras.charAt(parseInt(numero) % 23) === letra;
    }
  },
  
  // Estados Unidos - EIN
  {
    pais: 'US',
    paisNombre: 'Estados Unidos',
    tipoId: 'EIN',
    tipoIdNombre: 'Employer Identification Number',
    regex: /^[0-9]{2}-?[0-9]{7}$/,
    mascara: '99-9999999',
    ejemplo: '12-3456789',
    descripcion: '2 dígitos + guion + 7 dígitos',
    validacion: (id: string) => {
      const cleaned = id.replace(/-/g, '');
      if (cleaned.length !== 9) return false;
      // Validar prefijos válidos de EIN (01-06, 10-16, 20-27, etc.)
      const prefix = parseInt(cleaned.substring(0, 2));
      const validPrefixes = [
        ...Array.from({length: 6}, (_, i) => i + 1),     // 01-06
        ...Array.from({length: 7}, (_, i) => i + 10),    // 10-16
        ...Array.from({length: 8}, (_, i) => i + 20),    // 20-27
        ...Array.from({length: 8}, (_, i) => i + 30),    // 30-37
        ...Array.from({length: 5}, (_, i) => i + 40),    // 40-44
        ...Array.from({length: 8}, (_, i) => i + 45),    // 45-52
        ...Array.from({length: 7}, (_, i) => i + 54),    // 54-60
        ...Array.from({length: 10}, (_, i) => i + 61),   // 61-70
        ...Array.from({length: 8}, (_, i) => i + 71),    // 71-78
        ...Array.from({length: 10}, (_, i) => i + 80),   // 80-89
        ...Array.from({length: 3}, (_, i) => i + 90),    // 90-92
        94, 95, 99
      ];
      return validPrefixes.includes(prefix);
    }
  },
  
  // Chile - RUT
  {
    pais: 'CL',
    paisNombre: 'Chile',
    tipoId: 'RUT',
    tipoIdNombre: 'Rol Único Tributario',
    regex: /^[0-9]{1,2}\.[0-9]{3}\.[0-9]{3}-[0-9Kk]$/,
    mascara: '99.999.999-X',
    ejemplo: '12.345.678-5',
    descripcion: 'Formato: XX.XXX.XXX-V (V = dígito verificador)',
    validacion: (id: string) => {
      const cleaned = id.replace(/[.-]/g, '').toUpperCase();
      if (cleaned.length < 8 || cleaned.length > 9) return false;
      
      const cuerpo = cleaned.slice(0, -1);
      const dv = cleaned.slice(-1);
      
      let suma = 0;
      let multiplicador = 2;
      
      for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo.charAt(i)) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
      }
      
      const resto = suma % 11;
      const dvCalculado = resto === 0 ? '0' : resto === 1 ? 'K' : String(11 - resto);
      
      return dv === dvCalculado;
    }
  },
  
  // Argentina - CUIT/CUIL
  {
    pais: 'AR',
    paisNombre: 'Argentina',
    tipoId: 'CUIT',
    tipoIdNombre: 'Clave Única de Identificación Tributaria',
    regex: /^(20|23|24|27|30|33|34)-?[0-9]{8}-?[0-9]$/,
    mascara: '99-99999999-9',
    ejemplo: '20-12345678-9',
    descripcion: '2 dígitos tipo + 8 dígitos DNI + 1 dígito verificador',
    validacion: (id: string) => {
      const cleaned = id.replace(/-/g, '');
      if (cleaned.length !== 11) return false;
      
      const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      let suma = 0;
      
      for (let i = 0; i < 10; i++) {
        suma += parseInt(cleaned.charAt(i)) * multiplicadores[i];
      }
      
      const resto = suma % 11;
      const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
      
      return parseInt(cleaned.charAt(10)) === verificador;
    }
  },
  
  // Colombia - NIT
  {
    pais: 'CO',
    paisNombre: 'Colombia',
    tipoId: 'NIT',
    tipoIdNombre: 'Número de Identificación Tributaria',
    regex: /^[0-9]{9,10}-?[0-9]$/,
    mascara: '9999999999-9',
    ejemplo: '900123456-7',
    descripcion: '9-10 dígitos + guion + dígito de verificación',
    validacion: (id: string) => {
      const cleaned = id.replace(/-/g, '');
      if (cleaned.length < 10 || cleaned.length > 11) return false;
      
      const cuerpo = cleaned.slice(0, -1);
      const dv = parseInt(cleaned.slice(-1));
      
      const multiplicadores = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
      let suma = 0;
      const cuerpoReverse = cuerpo.split('').reverse();
      
      for (let i = 0; i < cuerpoReverse.length; i++) {
        suma += parseInt(cuerpoReverse[i]) * multiplicadores[i];
      }
      
      const resto = suma % 11;
      const dvCalculado = resto > 1 ? 11 - resto : resto;
      
      return dv === dvCalculado;
    }
  },
  
  // Perú - RUC
  {
    pais: 'PE',
    paisNombre: 'Perú',
    tipoId: 'RUC',
    tipoIdNombre: 'Registro Único de Contribuyentes',
    regex: /^(10|15|17|20)[0-9]{9}$/,
    mascara: '99999999999',
    ejemplo: '20123456789',
    descripcion: '11 dígitos (10=persona, 20=empresa)',
    validacion: (id: string) => {
      if (id.length !== 11) return false;
      const tipo = id.substring(0, 2);
      return ['10', '15', '17', '20'].includes(tipo);
    }
  },
  
  // Brasil - CNPJ/CPF
  {
    pais: 'BR',
    paisNombre: 'Brasil',
    tipoId: 'CNPJ',
    tipoIdNombre: 'Cadastro Nacional de Pessoa Jurídica',
    regex: /^[0-9]{2}\.?[0-9]{3}\.?[0-9]{3}\/?[0-9]{4}-?[0-9]{2}$/,
    mascara: '99.999.999/9999-99',
    ejemplo: '12.345.678/0001-95',
    descripcion: 'XX.XXX.XXX/XXXX-XX (14 dígitos)',
    validacion: (id: string) => {
      const cleaned = id.replace(/[.\/-]/g, '');
      if (cleaned.length !== 14) return false;
      
      // Validar dígitos verificadores
      const calcDV = (cnpj: string, pesos: number[]) => {
        let suma = 0;
        for (let i = 0; i < pesos.length; i++) {
          suma += parseInt(cnpj.charAt(i)) * pesos[i];
        }
        const resto = suma % 11;
        return resto < 2 ? 0 : 11 - resto;
      };
      
      const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      
      const dv1 = calcDV(cleaned, pesos1);
      const dv2 = calcDV(cleaned, pesos2);
      
      return parseInt(cleaned.charAt(12)) === dv1 && parseInt(cleaned.charAt(13)) === dv2;
    }
  },
  
  // Reino Unido - VAT Number
  {
    pais: 'GB',
    paisNombre: 'Reino Unido',
    tipoId: 'VAT',
    tipoIdNombre: 'VAT Registration Number',
    regex: /^GB[0-9]{9}$|^GB[0-9]{12}$|^GBGD[0-9]{3}$|^GBHA[0-9]{3}$/,
    mascara: 'GB999999999',
    ejemplo: 'GB123456789',
    descripcion: 'GB + 9 o 12 dígitos',
  },
  
  // Alemania - USt-IdNr
  {
    pais: 'DE',
    paisNombre: 'Alemania',
    tipoId: 'UST',
    tipoIdNombre: 'Umsatzsteuer-Identifikationsnummer',
    regex: /^DE[0-9]{9}$/,
    mascara: 'DE999999999',
    ejemplo: 'DE123456789',
    descripcion: 'DE + 9 dígitos',
  },
  
  // Francia - SIRET/SIREN
  {
    pais: 'FR',
    paisNombre: 'Francia',
    tipoId: 'TVA',
    tipoIdNombre: 'Numéro de TVA',
    regex: /^FR[0-9A-Z]{2}[0-9]{9}$/,
    mascara: 'FRXX999999999',
    ejemplo: 'FR12345678901',
    descripcion: 'FR + 2 caracteres + 9 dígitos (SIREN)',
  },
  
  // Italia - Partita IVA
  {
    pais: 'IT',
    paisNombre: 'Italia',
    tipoId: 'PIVA',
    tipoIdNombre: 'Partita IVA',
    regex: /^IT[0-9]{11}$/,
    mascara: 'IT99999999999',
    ejemplo: 'IT12345678901',
    descripcion: 'IT + 11 dígitos',
  },
  
  // Portugal - NIF
  {
    pais: 'PT',
    paisNombre: 'Portugal',
    tipoId: 'NIF',
    tipoIdNombre: 'Número de Identificação Fiscal',
    regex: /^[0-9]{9}$/,
    mascara: '999999999',
    ejemplo: '123456789',
    descripcion: '9 dígitos',
    validacion: (id: string) => {
      if (id.length !== 9) return false;
      const multiplicadores = [9, 8, 7, 6, 5, 4, 3, 2, 1];
      let suma = 0;
      for (let i = 0; i < 9; i++) {
        suma += parseInt(id.charAt(i)) * multiplicadores[i];
      }
      return suma % 11 === 0;
    }
  },
];

// Obtener configuraciones por país
export function getFiscalIdConfigsByCountry(pais: string): FiscalIdConfig[] {
  return FISCAL_ID_CONFIGS.filter(config => config.pais === pais);
}

// Obtener configuración específica
export function getFiscalIdConfig(pais: string, tipoId: string): FiscalIdConfig | undefined {
  return FISCAL_ID_CONFIGS.find(config => config.pais === pais && config.tipoId === tipoId);
}

// Validar ID fiscal
export function validateFiscalId(pais: string, tipoId: string, valor: string): {
  valid: boolean;
  error?: string;
  formatted?: string;
} {
  const config = getFiscalIdConfig(pais, tipoId);
  
  if (!config) {
    return { valid: true }; // Si no hay configuración, aceptar cualquier valor
  }
  
  const cleaned = valor.trim().toUpperCase();
  
  // Validar formato con regex
  if (!config.regex.test(cleaned)) {
    return {
      valid: false,
      error: `Formato inválido. Ejemplo: ${config.ejemplo}`
    };
  }
  
  // Validación adicional si existe
  if (config.validacion && !config.validacion(cleaned)) {
    return {
      valid: false,
      error: `El ${config.tipoIdNombre} tiene un dígito de control inválido`
    };
  }
  
  return {
    valid: true,
    formatted: cleaned
  };
}

// La BD guardó nombres de país ('España') en lugar de códigos ('ES') en
// perfiles viejos (default del schema). La API/UI trabajan con códigos, así
// que normalizamos nombre -> código. Si no es un nombre conocido, devuelve
// el valor tal cual (ya es un código o es un país nuevo).
const PAIS_NOMBRE_A_CODIGO: Record<string, string> = {
  'España': 'ES', 'Espana': 'ES',
  'México': 'MX', 'Mexico': 'MX',
  'Estados Unidos': 'US',
  'Chile': 'CL',
  'Argentina': 'AR',
  'Colombia': 'CO',
  'Perú': 'PE', 'Peru': 'PE',
  'Brasil': 'BR',
  'Reino Unido': 'GB',
  'Alemania': 'DE',
  'Francia': 'FR',
  'Italia': 'IT',
  'Portugal': 'PT',
};

export function normalizarPais(pais: string | null | undefined): string | null {
  if (!pais) return null;
  const trimmed = pais.trim();
  return PAIS_NOMBRE_A_CODIGO[trimmed] || trimmed;
}

// Obtener lista de países soportados
export function getSupportedCountries(): { codigo: string; nombre: string }[] {
  const paises = new Map<string, string>();
  FISCAL_ID_CONFIGS.forEach(config => {
    if (!paises.has(config.pais)) {
      paises.set(config.pais, config.paisNombre);
    }
  });
  return Array.from(paises.entries()).map(([codigo, nombre]) => ({ codigo, nombre }));
}

// Lista de regímenes fiscales comunes por país
export const REGIMENES_FISCALES: Record<string, { codigo: string; nombre: string }[]> = {
  MX: [
    { codigo: '601', nombre: 'General de Ley Personas Morales' },
    { codigo: '603', nombre: 'Personas Morales con Fines no Lucrativos' },
    { codigo: '605', nombre: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
    { codigo: '606', nombre: 'Arrendamiento' },
    { codigo: '607', nombre: 'Régimen de Enajenación o Adquisición de Bienes' },
    { codigo: '608', nombre: 'Demás ingresos' },
    { codigo: '610', nombre: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
    { codigo: '611', nombre: 'Ingresos por Dividendos (socios y accionistas)' },
    { codigo: '612', nombre: 'Personas Físicas con Actividades Empresariales y Profesionales' },
    { codigo: '614', nombre: 'Ingresos por intereses' },
    { codigo: '615', nombre: 'Régimen de los ingresos por obtención de premios' },
    { codigo: '616', nombre: 'Sin obligaciones fiscales' },
    { codigo: '620', nombre: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
    { codigo: '621', nombre: 'Incorporación Fiscal' },
    { codigo: '622', nombre: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
    { codigo: '623', nombre: 'Opcional para Grupos de Sociedades' },
    { codigo: '624', nombre: 'Coordinados' },
    { codigo: '625', nombre: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
    { codigo: '626', nombre: 'Régimen Simplificado de Confianza' },
  ],
  ES: [
    { codigo: 'GEN', nombre: 'Régimen General' },
    { codigo: 'SIM', nombre: 'Régimen Simplificado' },
    { codigo: 'REC', nombre: 'Recargo de Equivalencia' },
    { codigo: 'AGR', nombre: 'Agricultura, Ganadería y Pesca' },
    { codigo: 'ORO', nombre: 'Oro de Inversión' },
    { codigo: 'GRU', nombre: 'Grupos de Entidades' },
  ],
  US: [
    { codigo: 'C-CORP', nombre: 'C Corporation' },
    { codigo: 'S-CORP', nombre: 'S Corporation' },
    { codigo: 'LLC', nombre: 'Limited Liability Company' },
    { codigo: 'PART', nombre: 'Partnership' },
    { codigo: 'SOLE', nombre: 'Sole Proprietorship' },
    { codigo: 'NP', nombre: 'Non-Profit Organization' },
  ],
};

// Obtener regímenes fiscales por país
export function getRegimenesFiscales(pais: string): { codigo: string; nombre: string }[] {
  return REGIMENES_FISCALES[pais] || [];
}

// Monedas por país
export const MONEDAS_POR_PAIS: Record<string, { codigo: string; nombre: string; simbolo: string }> = {
  MX: { codigo: 'MXN', nombre: 'Peso Mexicano', simbolo: '$' },
  ES: { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
  US: { codigo: 'USD', nombre: 'Dólar Estadounidense', simbolo: '$' },
  CL: { codigo: 'CLP', nombre: 'Peso Chileno', simbolo: '$' },
  AR: { codigo: 'ARS', nombre: 'Peso Argentino', simbolo: '$' },
  CO: { codigo: 'COP', nombre: 'Peso Colombiano', simbolo: '$' },
  PE: { codigo: 'PEN', nombre: 'Sol Peruano', simbolo: 'S/' },
  BR: { codigo: 'BRL', nombre: 'Real Brasileño', simbolo: 'R$' },
  GB: { codigo: 'GBP', nombre: 'Libra Esterlina', simbolo: '£' },
  DE: { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
  FR: { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
  IT: { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
  PT: { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
};

// Países de la UE (para lógica de inversión de sujeto pasivo)
export const PAISES_UE = ['ES', 'DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'AT', 'IE', 'PL', 'SE', 'DK', 'FI', 'GR', 'CZ', 'RO', 'HU', 'SK', 'BG', 'HR', 'SI', 'LT', 'LV', 'EE', 'CY', 'LU', 'MT'];

// Verificar si aplica inversión de sujeto pasivo (Reverse Charge)
export function aplicaInversionSujetoPasivo(paisEmisor: string, paisCliente: string, clienteTieneIdIntracomunitario: boolean): boolean {
  // Ambos países deben estar en la UE
  if (!PAISES_UE.includes(paisEmisor) || !PAISES_UE.includes(paisCliente)) {
    return false;
  }
  
  // Deben ser países diferentes
  if (paisEmisor === paisCliente) {
    return false;
  }
  
  // El cliente debe tener ID intracomunitario válido
  return clienteTieneIdIntracomunitario;
}

// Tasas de IVA predeterminadas por país
export const TASAS_IVA_PREDETERMINADAS: Record<string, { general: number; reducida?: number; superReducida?: number }> = {
  ES: { general: 21, reducida: 10, superReducida: 4 },
  MX: { general: 16, reducida: 0 },
  US: { general: 0 }, // Varía por estado
  CL: { general: 19 },
  AR: { general: 21, reducida: 10.5 },
  CO: { general: 19, reducida: 5 },
  PE: { general: 18 },
  BR: { general: 17 }, // ICMS varía por estado
  GB: { general: 20, reducida: 5 },
  DE: { general: 19, reducida: 7 },
  FR: { general: 20, reducida: 10, superReducida: 5.5 },
  IT: { general: 22, reducida: 10, superReducida: 4 },
  PT: { general: 23, reducida: 13, superReducida: 6 },
};

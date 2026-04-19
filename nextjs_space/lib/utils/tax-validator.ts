/**
 * Utilidades de Validación Fiscal (Roadmap Veri*factu 2026)
 */

export const validateSpanishID = (id: string): { isValid: boolean; type: 'NIF' | 'CIF' | 'NIE' | 'UNKNOWN', error?: string } => {
  const cleanId = id.toUpperCase().trim();
  
  if (!cleanId) return { isValid: false, type: 'UNKNOWN', error: 'El identificador no puede estar vacío.' };

  // 1. Regex básica de formato
  const nifRegex = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
  const nieRegex = /^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
  const cifRegex = /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;

  // 2. Validación Algoritmo NIF/NIE (Módulo 23)
  if (nifRegex.test(cleanId) || nieRegex.test(cleanId)) {
    const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    let numberPart = cleanId;
    
    if (cleanId.startsWith('X')) numberPart = cleanId.replace('X', '0');
    if (cleanId.startsWith('Y')) numberPart = cleanId.replace('Y', '1');
    if (cleanId.startsWith('Z')) numberPart = cleanId.replace('Z', '2');
    
    const number = parseInt(numberPart.substring(0, 8));
    if (isNaN(number)) return { isValid: false, type: 'UNKNOWN', error: 'Formato numérico inválido.' };
    
    const expectedLetter = letters[number % 23];
    
    if (cleanId.at(-1) === expectedLetter) {
      return { isValid: true, type: cleanId.match(/^[XYZ]/) ? 'NIE' : 'NIF' };
    } else {
      return { isValid: false, type: cleanId.match(/^[XYZ]/) ? 'NIE' : 'NIF', error: `Letra de control incorrecta. Se esperaba '${expectedLetter}'.` };
    }
  }

  // 3. Validación CIF (Empresas) - Algoritmo AEAT Alta Fidelidad
  if (cifRegex.test(cleanId)) {
    const orgLetter = cleanId[0];
    const digits = cleanId.substring(1, 8);
    const control = cleanId[8];

    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let n = parseInt(digits[i]);
        if (i % 2 === 0) { // Posiciones impares (1, 3, 5, 7) para el humano, i=0,2,4,6 para JS
            n *= 2;
            if (n > 9) n = Math.floor(n / 10) + (n % 10);
        }
        sum += n;
    }

    const lastDigit = (10 - (sum % 10)) % 10;
    const letters = 'JABCDEFGHI'; // 0=J, 1=A, 2=B, 3=C, 4=D, 5=E, 6=F, 7=G, 8=H, 9=I
    const expectedLetter = letters[lastDigit];
    
    // Reglas de tipo de control según letra de organización
    const isNumOnly = 'ABEH'.includes(orgLetter);
    const isLetterOnly = 'PQRSW'.includes(orgLetter);
    
    let isControlValid = false;
    if (isNumOnly) {
        isControlValid = control === lastDigit.toString();
    } else if (isLetterOnly) {
        isControlValid = control === expectedLetter;
    } else {
        // Puede ser cualquiera de los dos
        isControlValid = control === lastDigit.toString() || control === expectedLetter;
    }

    if (isControlValid) {
        return { isValid: true, type: 'CIF' };
    } else {
        const msg = isNumOnly ? `Se esperaba número ${lastDigit}` : 
                    isLetterOnly ? `Se esperaba letra ${expectedLetter}` : 
                    `Se esperaba número ${lastDigit} o letra ${expectedLetter}`;
        return { isValid: false, type: 'CIF', error: `Dígito de control de CIF inválido. ${msg}.` };
    }
  }

  return { isValid: false, type: 'UNKNOWN', error: 'Formato de identificador no reconocido (NIF/CIF/NIE).' };
};

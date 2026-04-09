
/**
 * Hunter.io Integration Library
 * Búsqueda y verificación de emails profesionales
 */

interface HunterConfig {
  apiKey: string;
}

interface HunterSearchParams {
  domain?: string;
  company?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  type?: 'personal' | 'generic';
  offset?: number;
  limit?: number;
}

interface HunterEmailVerification {
  email: string;
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
  score: number;
  regexp: boolean;
  gibberish: boolean;
  disposable: boolean;
  webmail: boolean;
  mx_records: boolean;
  smtp_server: boolean;
  smtp_check: boolean;
  accept_all: boolean;
}

interface HunterEmail {
  value: string;
  type: string;
  confidence: number;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  linkedin?: string;
  twitter?: string;
  phoneNumber?: string;
  sources: Array<{
    domain: string;
    uri: string;
    extracted_on: string;
  }>;
}

interface HunterSearchResult {
  emails: HunterEmail[];
  meta: {
    results: number;
    limit: number;
    offset: number;
    params: HunterSearchParams;
  };
}

class HunterIO {
  private config: HunterConfig;
  private baseUrl = 'https://api.hunter.io/v2';

  constructor(config: HunterConfig) {
    this.config = config;
  }

  /**
   * Buscar emails por dominio o empresa
   */
  async domainSearch(params: HunterSearchParams): Promise<HunterSearchResult> {
    try {
      const queryParams = new URLSearchParams({
        api_key: this.config.apiKey,
        limit: (params.limit || 10).toString(),
        offset: (params.offset || 0).toString(),
      });

      if (params.domain) queryParams.append('domain', params.domain);
      if (params.company) queryParams.append('company', params.company);
      if (params.type) queryParams.append('type', params.type);
      if (params.department) queryParams.append('department', params.department);

      const response = await fetch(
        `${this.baseUrl}/domain-search?${queryParams.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.errors?.[0]?.details || 'Error en búsqueda de Hunter.io');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error en domainSearch de Hunter.io:', error);
      throw error;
    }
  }

  /**
   * Encontrar email específico de una persona
   */
  async emailFinder(params: {
    domain: string;
    firstName: string;
    lastName: string;
    company?: string;
  }): Promise<HunterEmail | null> {
    try {
      const queryParams = new URLSearchParams({
        api_key: this.config.apiKey,
        domain: params.domain,
        first_name: params.firstName,
        last_name: params.lastName,
      });

      if (params.company) {
        queryParams.append('company', params.company);
      }

      const response = await fetch(
        `${this.baseUrl}/email-finder?${queryParams.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.errors?.[0]?.details || 'Error al buscar email');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error en emailFinder de Hunter.io:', error);
      throw error;
    }
  }

  /**
   * Verificar validez de un email
   */
  async verifyEmail(email: string): Promise<HunterEmailVerification> {
    try {
      const queryParams = new URLSearchParams({
        api_key: this.config.apiKey,
        email,
      });

      const response = await fetch(
        `${this.baseUrl}/email-verifier?${queryParams.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.errors?.[0]?.details || 'Error al verificar email');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error en verifyEmail de Hunter.io:', error);
      throw error;
    }
  }

  /**
   * Obtener información de créditos disponibles
   */
  async getAccountInfo() {
    try {
      const response = await fetch(
        `${this.baseUrl}/account?api_key=${this.config.apiKey}`
      );

      if (!response.ok) {
        throw new Error('Error al obtener información de cuenta');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error en getAccountInfo de Hunter.io:', error);
      throw error;
    }
  }
}

/**
 * Transformar resultados de Hunter a formato estándar de Lead
 */
export function transformHunterToLead(hunterEmail: HunterEmail, domain: string) {
  return {
    nombre: hunterEmail.firstName || '',
    apellido: hunterEmail.lastName || '',
    email: hunterEmail.value,
    telefono: hunterEmail.phoneNumber || null,
    empresa: domain,
    cargo: hunterEmail.position || null,
    source: 'hunter.io' as const,
    metadata: {
      confidence: hunterEmail.confidence,
      department: hunterEmail.department,
      linkedin: hunterEmail.linkedin,
      twitter: hunterEmail.twitter,
      sources: hunterEmail.sources,
      type: hunterEmail.type,
    },
  };
}

export default HunterIO;
export type { HunterSearchParams, HunterEmail, HunterSearchResult, HunterEmailVerification };

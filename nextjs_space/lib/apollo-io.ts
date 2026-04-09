
/**
 * Apollo.io Integration Library
 * Handles API requests to Apollo.io for lead enrichment and search
 */

import { toast } from 'sonner'

interface ApolloSearchParams {
  // Persona criteria
  person_titles?: string[]
  person_locations?: string[]
  person_seniorities?: string[]
  
  // Organization criteria
  organization_locations?: string[]
  organization_industries?: string[]
  organization_num_employees_ranges?: string[]
  
  // Additional filters
  q_keywords?: string
  page?: number
  per_page?: number
}

interface ApolloContact {
  id: string
  first_name: string
  last_name: string
  name: string
  linkedin_url?: string
  title: string
  email?: string
  phone_numbers?: Array<{ raw_number: string; sanitized_number: string }>
  organization?: {
    id: string
    name: string
    website_url?: string
    industry?: string
    linkedin_url?: string
  }
  city?: string
  state?: string
  country?: string
}

interface ApolloSearchResponse {
  contacts: ApolloContact[]
  pagination: {
    page: number
    per_page: number
    total_entries: number
    total_pages: number
  }
}

export class ApolloIOClient {
  private apiKey: string
  private baseUrl: string = 'https://api.apollo.io/v1'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Search for contacts/leads using Apollo.io People Search API
   */
  async searchContacts(params: ApolloSearchParams): Promise<ApolloSearchResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          ...params,
          page: params.page || 1,
          per_page: params.per_page || 25,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Error al buscar contactos en Apollo.io')
      }

      const data = await response.json()
      
      return {
        contacts: data.people || [],
        pagination: data.pagination || {
          page: 1,
          per_page: 25,
          total_entries: 0,
          total_pages: 0,
        },
      }
    } catch (error: any) {
      console.error('Apollo.io search error:', error)
      throw new Error(error.message || 'Error al conectar con Apollo.io')
    }
  }

  /**
   * Enrich a contact with additional data
   */
  async enrichContact(email: string): Promise<ApolloContact | null> {
    try {
      const response = await fetch(`${this.baseUrl}/people/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          email,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Error al enriquecer contacto')
      }

      const data = await response.json()
      return data.person || null
    } catch (error: any) {
      console.error('Apollo.io enrich error:', error)
      return null
    }
  }

  /**
   * Get available filters and their options
   */
  async getFilterOptions(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/misc/info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
      })

      if (!response.ok) {
        throw new Error('Error al obtener opciones de filtros')
      }

      return await response.json()
    } catch (error: any) {
      console.error('Apollo.io filter options error:', error)
      return null
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/health`, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      return response.ok
    } catch (error) {
      console.error('Apollo.io connection test failed:', error)
      return false
    }
  }
}

/**
 * Transform Apollo contact to standard lead format
 */
export function transformApolloContactToLead(contact: ApolloContact) {
  return {
    nombre: contact.first_name || '',
    apellido: contact.last_name || '',
    email: contact.email || '',
    telefono: contact.phone_numbers?.[0]?.sanitized_number || '',
    empresa: contact.organization?.name || '',
    cargo: contact.title || '',
    pais: contact.country || '',
    ciudad: contact.city || '',
    estado: contact.state || '',
    sitioWeb: contact.organization?.website_url || '',
    linkedinUrl: contact.linkedin_url || '',
    industria: contact.organization?.industry || '',
    fuente: 'apollo',
    metadata: {
      apollo_id: contact.id,
      organization_linkedin: contact.organization?.linkedin_url,
    },
  }
}

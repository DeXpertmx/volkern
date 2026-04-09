
/**
 * LinkedIn Integration Library
 * Handles LinkedIn Sales Navigator API integration for lead generation
 * 
 * IMPORTANT: LinkedIn's official API has strict limitations.
 * This implementation uses LinkedIn Sales Navigator API which requires:
 * 1. LinkedIn Sales Navigator subscription
 * 2. Approved LinkedIn Partnership
 * 3. OAuth 2.0 authentication
 * 
 * Alternative approaches:
 * - Use third-party services like PhantomBuster, Apify
 * - Use browser automation (Puppeteer/Playwright) - against ToS
 * - Use official LinkedIn Marketing API for limited data
 */

interface LinkedInSearchParams {
  keywords?: string
  title?: string
  company?: string
  school?: string
  location?: string
  industry?: string[]
  currentCompany?: string[]
  pastCompany?: string[]
  
  // Pagination
  start?: number
  count?: number
}

interface LinkedInProfile {
  id: string
  firstName: string
  lastName: string
  headline: string
  publicProfileUrl?: string
  location?: {
    name: string
    country: string
  }
  industry?: string
  positions?: Array<{
    title: string
    companyName: string
    current: boolean
  }>
  emailAddress?: string
  phoneNumbers?: Array<{
    number: string
    type: string
  }>
}

interface LinkedInSearchResponse {
  elements: LinkedInProfile[]
  paging: {
    start: number
    count: number
    total: number
  }
}

export class LinkedInClient {
  private accessToken: string
  private baseUrl: string = 'https://api.linkedin.com/v2'

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  /**
   * Search for people using LinkedIn Sales Navigator API
   * NOTE: This requires LinkedIn Sales Navigator API access
   */
  async searchPeople(params: LinkedInSearchParams): Promise<LinkedInSearchResponse> {
    try {
      // Build query parameters
      const queryParams = new URLSearchParams()
      
      if (params.keywords) queryParams.append('keywords', params.keywords)
      if (params.title) queryParams.append('title', params.title)
      if (params.company) queryParams.append('company', params.company)
      if (params.location) queryParams.append('location', params.location)
      if (params.start) queryParams.append('start', params.start.toString())
      queryParams.append('count', (params.count || 25).toString())

      const response = await fetch(
        `${this.baseUrl}/salesNavigatorSearch/people?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Error al buscar en LinkedIn')
      }

      const data = await response.json()
      
      return {
        elements: data.elements || [],
        paging: data.paging || {
          start: 0,
          count: 0,
          total: 0,
        },
      }
    } catch (error: any) {
      console.error('LinkedIn search error:', error)
      throw new Error(error.message || 'Error al conectar con LinkedIn')
    }
  }

  /**
   * Get profile details by ID
   */
  async getProfile(profileId: string): Promise<LinkedInProfile | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/people/${profileId}?projection=(id,firstName,lastName,headline,publicProfileUrl,location,industry,positions)`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error('Error al obtener perfil de LinkedIn')
      }

      return await response.json()
    } catch (error: any) {
      console.error('LinkedIn profile error:', error)
      return null
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      })

      return response.ok
    } catch (error) {
      console.error('LinkedIn connection test failed:', error)
      return false
    }
  }
}

/**
 * Transform LinkedIn profile to standard lead format
 */
export function transformLinkedInProfileToLead(profile: LinkedInProfile) {
  const currentPosition = profile.positions?.find(p => p.current)
  
  return {
    nombre: profile.firstName || '',
    apellido: profile.lastName || '',
    email: profile.emailAddress || '',
    telefono: profile.phoneNumbers?.[0]?.number || '',
    empresa: currentPosition?.companyName || '',
    cargo: currentPosition?.title || profile.headline || '',
    pais: profile.location?.country || '',
    ciudad: profile.location?.name || '',
    linkedinUrl: profile.publicProfileUrl || '',
    industria: profile.industry || '',
    fuente: 'linkedin',
    metadata: {
      linkedin_id: profile.id,
      headline: profile.headline,
    },
  }
}

/**
 * Alternative: PhantomBuster Integration
 * For users without LinkedIn Sales Navigator API access
 */
export class PhantomBusterLinkedInClient {
  private apiKey: string
  private baseUrl: string = 'https://api.phantombuster.com/api/v2'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Launch LinkedIn profile scraper
   */
  async launchProfileScraper(profileUrls: string[]) {
    try {
      const response = await fetch(`${this.baseUrl}/agents/launch`, {
        method: 'POST',
        headers: {
          'X-Phantombuster-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'PHANTOM_ID', // Replace with actual phantom ID
          argument: {
            profileUrls: profileUrls.join(','),
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Error al lanzar scraper de LinkedIn')
      }

      return await response.json()
    } catch (error: any) {
      console.error('PhantomBuster launch error:', error)
      throw error
    }
  }

  /**
   * Get scraper results
   */
  async getScraperResults(containerId: string) {
    try {
      const response = await fetch(
        `${this.baseUrl}/containers/fetch-result-object?id=${containerId}`,
        {
          method: 'GET',
          headers: {
            'X-Phantombuster-Key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Error al obtener resultados del scraper')
      }

      return await response.json()
    } catch (error: any) {
      console.error('PhantomBuster results error:', error)
      throw error
    }
  }
}

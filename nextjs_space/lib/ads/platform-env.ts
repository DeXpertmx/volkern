/**
 * Requisitos de credenciales de las plataformas de ADS.
 *
 * Los conectores de `lib/ads/connectors/*` leen variables propias (`ADS_*`),
 * distintas de las del módulo social (`FACEBOOK_*`, `GOOGLE_CLIENT_*`): son
 * apps de desarrollador diferentes, con productos y revisión distintos.
 *
 * Este módulo es la única fuente de la lista: lo usan la ruta que inicia el
 * OAuth (para no mandar al usuario a un diálogo que no existe) y la pantalla,
 * que muestra por nombre lo que falta. Nunca devuelve valores, solo nombres.
 */

export const ADS_PLATFORMS = ['META', 'GOOGLE', 'LINKEDIN', 'TIKTOK'] as const

export type AdsPlatformKey = (typeof ADS_PLATFORMS)[number]

export interface RequisitoAds {
  /** Nombre visible de la plataforma. */
  nombre: string
  /** Client/App id de la app de anuncios. */
  id: string
  /** Secreto de la app de anuncios. */
  secret: string
  /**
   * Variables que la API necesita después del OAuth. Sin ellas se puede
   * autorizar, pero no leer ni crear campañas.
   */
  extra: string[]
  docsUrl: string
}

export const ADS_PLATFORM_ENV: Record<AdsPlatformKey, RequisitoAds> = {
  META: {
    nombre: 'Meta Ads',
    id: 'ADS_META_CLIENT_ID',
    secret: 'ADS_META_CLIENT_SECRET',
    extra: [],
    docsUrl: 'https://developers.facebook.com/apps/',
  },
  GOOGLE: {
    nombre: 'Google Ads',
    id: 'ADS_GOOGLE_CLIENT_ID',
    secret: 'ADS_GOOGLE_CLIENT_SECRET',
    extra: ['ADS_GOOGLE_DEVELOPER_TOKEN'],
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  LINKEDIN: {
    nombre: 'LinkedIn Ads',
    id: 'ADS_LINKEDIN_CLIENT_ID',
    secret: 'ADS_LINKEDIN_CLIENT_SECRET',
    extra: [],
    docsUrl: 'https://www.linkedin.com/developers/apps',
  },
  TIKTOK: {
    nombre: 'TikTok Ads',
    id: 'ADS_TIKTOK_CLIENT_ID',
    secret: 'ADS_TIKTOK_CLIENT_SECRET',
    extra: [],
    docsUrl: 'https://business-api.tiktok.com/portal',
  },
}

export interface DisponibilidadAds {
  /** `true` si están las credenciales que bloquean el OAuth. */
  configured: boolean
  /** Variables que impiden iniciar la autorización. */
  missing: string[]
  /** Variables que faltan para operar, pero no para autorizar. */
  warnings: string[]
}

function presentes(nombres: string[]): string[] {
  return nombres.filter((nombre) => !process.env[nombre]?.trim())
}

export function disponibilidadAds(platform: AdsPlatformKey): DisponibilidadAds {
  const requisito = ADS_PLATFORM_ENV[platform]
  const missing = presentes([requisito.id, requisito.secret])

  return {
    configured: missing.length === 0,
    missing,
    warnings: presentes(requisito.extra),
  }
}

export function disponibilidadPorPlataformaAds(): Record<AdsPlatformKey, DisponibilidadAds> {
  return ADS_PLATFORMS.reduce(
    (acc, platform) => {
      acc[platform] = disponibilidadAds(platform)
      return acc
    },
    {} as Record<AdsPlatformKey, DisponibilidadAds>,
  )
}

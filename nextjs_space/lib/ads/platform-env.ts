/**
 * Requisitos de credenciales de las plataformas de ADS.
 *
 * Los conectores de `lib/ads/connectors/*` leen variables `ADS_*`, que pueden
 * coincidir con las del módulo social o no: la app de anuncios es otra app de
 * desarrollador con otros productos y otra revisión… salvo cuando el
 * proveedor permite reutilizarla. Meta es ese caso: una única app de Facebook
 * sirve para páginas, Instagram y anuncios, así que su client id/secreto son
 * los mismos `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` del módulo social. Por eso
 * cada requisito admite varias variables: se usa la primera presente y solo se
 * informa de la canónica cuando no hay ninguna.
 *
 * Nunca devuelve valores, solo nombres.
 */

export const ADS_PLATFORMS = ['META', 'GOOGLE', 'LINKEDIN', 'TIKTOK'] as const

export type AdsPlatformKey = (typeof ADS_PLATFORMS)[number]

export interface RequisitoAds {
  /** Nombre visible de la plataforma. */
  nombre: string
  /** Variables aceptables para el client/app id; gana la primera presente. */
  id: string[]
  /** Variables aceptables para el secreto de la app. */
  secret: string[]
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
    id: ['ADS_META_CLIENT_ID', 'FACEBOOK_APP_ID'],
    secret: ['ADS_META_CLIENT_SECRET', 'FACEBOOK_APP_SECRET'],
    extra: [],
    docsUrl: 'https://developers.facebook.com/apps/',
  },
  GOOGLE: {
    nombre: 'Google Ads',
    id: ['ADS_GOOGLE_CLIENT_ID'],
    secret: ['ADS_GOOGLE_CLIENT_SECRET'],
    // El developer token dejó de hacer falta: Google retiró los tokens el
    // 9/9/2026 y el nivel de acceso lo concede el proyecto de Google Cloud al
    // que pertenece el client id. Si sigue en el entorno, el conector lo envía
    // y la API lo ignora.
    extra: [],
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  LINKEDIN: {
    nombre: 'LinkedIn Ads',
    id: ['ADS_LINKEDIN_CLIENT_ID'],
    secret: ['ADS_LINKEDIN_CLIENT_SECRET'],
    extra: [],
    docsUrl: 'https://www.linkedin.com/developers/apps',
  },
  TIKTOK: {
    nombre: 'TikTok Ads',
    id: ['ADS_TIKTOK_CLIENT_ID'],
    secret: ['ADS_TIKTOK_CLIENT_SECRET'],
    extra: [],
    docsUrl: 'https://business-api.tiktok.com/portal',
  },
}

export interface DisponibilidadAds {
  /** `true` si están las credenciales que bloquean el OAuth. */
  configured: boolean
  /** Nombres canónicos de las variables que impiden iniciar la autorización. */
  missing: string[]
  /** Variables que faltan para operar, pero no para autorizar. */
  warnings: string[]
}

/** Primera variable del grupo que tenga valor, o `null` si no hay ninguna. */
function primeraPresente(nombres: string[]): string | null {
  for (const nombre of nombres) {
    const valor = process.env[nombre]?.trim()
    if (valor) return valor
  }
  return null
}

export function credencialesAds(platform: AdsPlatformKey): {
  clientId: string | null
  clientSecret: string | null
} {
  const requisito = ADS_PLATFORM_ENV[platform]
  return {
    clientId: primeraPresente(requisito.id),
    clientSecret: primeraPresente(requisito.secret),
  }
}

export function disponibilidadAds(platform: AdsPlatformKey): DisponibilidadAds {
  const requisito = ADS_PLATFORM_ENV[platform]
  const { clientId, clientSecret } = credencialesAds(platform)
  const warnings = requisito.extra.filter((nombre) => !process.env[nombre]?.trim())

  return {
    configured: Boolean(clientId && clientSecret),
    missing: [
      ...(clientId ? [] : [requisito.id[0]]),
      ...(clientSecret ? [] : [requisito.secret[0]]),
    ],
    warnings,
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

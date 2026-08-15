import { describe, expect, it } from 'vitest'

import { extractOwnerProfileFromConnection } from '@/lib/evolution-instances'

describe('extractOwnerProfileFromConnection', () => {
  it('extrae phone, name y foto desde el payload de CONNECTION_UPDATE', () => {
    const profile = extractOwnerProfileFromConnection({
      state: 'open',
      phone: '34600111222',
      name: 'Dimension Expert',
      profilePicUrl: 'https://pps.whatsapp.net/photo.jpg',
    })

    expect(profile.phoneNumber).toBe('34600111222')
    expect(profile.profileName).toBe('Dimension Expert')
    expect(profile.profilePicUrl).toBe('https://pps.whatsapp.net/photo.jpg')
  })

  it('normaliza el número si viene con sufijo de WhatsApp', () => {
    const profile = extractOwnerProfileFromConnection({
      id: '34600971950@s.whatsapp.net',
      notify: 'Mi Empresa',
    })

    expect(profile.phoneNumber).toBe('34600971950')
    expect(profile.profileName).toBe('Mi Empresa')
    expect(profile.profilePicUrl).toBeUndefined()
  })

  it('tolera payload sin datos de perfil', () => {
    const profile = extractOwnerProfileFromConnection({ state: 'connecting' })
    expect(profile.phoneNumber).toBeUndefined()
    expect(profile.profileName).toBeUndefined()
  })

  it('tolera data nulo', () => {
    expect(extractOwnerProfileFromConnection(null)).toEqual({})
    expect(extractOwnerProfileFromConnection(undefined)).toEqual({})
  })
})

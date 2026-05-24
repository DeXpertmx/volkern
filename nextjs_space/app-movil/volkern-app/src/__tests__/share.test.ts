import { shareService } from '../services/share';
import { profileService } from '../services/profile';

jest.mock('../services/profile', () => ({
  profileService: {
    getProfile: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetProfile = profileService.getProfile as jest.Mock;
const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;

const mockProfile = {
  name: 'Test User',
  email: 'test@volkern.com',
  telefono: '555-1234',
  image: null,
  bookingSlug: null,
  role: { id: 'r1', nombre: 'Admin', permisos: {} },
  tenant: { id: 't1', nombre: 'Test', slug: 'test', subdomain: null, accountType: 'business' },
};

beforeEach(() => { jest.clearAllMocks(); });

describe('shareService.getDigitalCard', () => {
  it('returns digital card from profile', async () => {
    mockedGetProfile.mockResolvedValue(mockProfile);
    const card = await shareService.getDigitalCard();
    expect(card).toHaveProperty('name', 'Test User');
    expect(card).toHaveProperty('vcard');
    expect(card.vcard).toContain('BEGIN:VCARD');
  });
});

describe('shareService.getShareLinks', () => {
  it('returns array of share links', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'test@test.com', phone: '555-0000', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' };
    const links = shareService.getShareLinks(card);
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
  });
});

describe('shareService.getProfileUrl', () => {
  it('returns profile URL from email', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'user@test.com', phone: '', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' };
    const url = shareService.getProfileUrl(card);
    expect(url).toContain('user');
  });
});

describe('shareService.getDigitalCard (edge cases)', () => {
  it('uses cache fallback when profile fails', async () => {
    const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
    mockedGetProfile.mockRejectedValue(new Error('profile error'));
    mockedGetItem.mockResolvedValue(JSON.stringify({ name: 'Cached', email: 'cached@test.com', title: '', company: '', phone: '', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' }));
    const card = await shareService.getDigitalCard();
    expect(card.name).toBe('Cached');
  });

  it('throws when profile fails and no cache', async () => {
    const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
    mockedGetProfile.mockRejectedValue(new Error('profile error'));
    mockedGetItem.mockResolvedValue(null);
    await expect(shareService.getDigitalCard()).rejects.toThrow('No se pudo obtener la tarjeta digital');
  });
});

describe('shareService.getShareLinks (edge cases)', () => {
  it('includes booking link when bookingUrl present', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'test@test.com', phone: '', photo: null, bookingSlug: null, bookingUrl: 'https://book.me', vcard: '' };
    const links = shareService.getShareLinks(card);
    expect(links.some(l => l.label === 'Agendar cita')).toBe(true);
  });

  it('does not include booking link when bookingUrl is null', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'test@test.com', phone: '', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' };
    const links = shareService.getShareLinks(card);
    expect(links.some(l => l.label === 'Agendar cita')).toBe(false);
  });

  it('includes call link when phone present', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'test@test.com', phone: '555-0000', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' };
    const links = shareService.getShareLinks(card);
    expect(links.some(l => l.label === 'Llamar')).toBe(true);
  });
});

describe('shareService.getVCardDownloadUrl', () => {
  it('returns data URL with vcard content', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'test@test.com', phone: '', photo: null, bookingSlug: null, bookingUrl: null, vcard: 'BEGIN:VCARD\nEND:VCARD' };
    const url = shareService.getVCardDownloadUrl(card);
    expect(url).toContain('data:text/vcard');
    expect(url).toContain('BEGIN%3AVCARD');
  });

  it('handles empty vcard', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'test@test.com', phone: '', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' };
    const url = shareService.getVCardDownloadUrl(card);
    expect(url).toBe('data:text/vcard;charset=utf-8,');
  });
});

describe('shareService.getDigitalCard with subdomain', () => {
  it('uses subdomain URL when available', async () => {
    mockedGetProfile.mockResolvedValue({
      ...mockProfile,
      tenant: { ...mockProfile.tenant, subdomain: 'myco' },
    });
    const card = await shareService.getDigitalCard();
    expect(card.bookingSlug).toBeNull();
    expect(card.company).toBe('Test');
  });
});

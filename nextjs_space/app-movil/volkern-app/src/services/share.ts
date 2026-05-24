import { profileService } from './profile';
import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DigitalCard {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  photo: string | null;
  bookingSlug: string | null;
  bookingUrl: string | null;
  vcard?: string;
}

export interface ShareLink {
  label: string;
  url: string;
  icon: string;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────
const CARD_CACHE_KEY = 'volkern_share_card';
const QR_CACHE_KEY = 'volkern_share_qr';

// ─── Service ──────────────────────────────────────────────────────────────────
class ShareService {
  /**
   * Get the user's digital business card data
   */
  async getDigitalCard(): Promise<DigitalCard> {
    try {
      const profile = await profileService.getProfile();
      const baseUrl = profile.tenant.subdomain
        ? `https://${profile.tenant.subdomain}.volkern.app`
        : `https://volkern.app/${profile.tenant.slug}`;

      const card: DigitalCard = {
        name: profile.name,
        title: profile.role?.nombre || 'Usuario',
        company: profile.tenant?.nombre || 'Volkern',
        email: profile.email,
        phone: profile.telefono || '',
        photo: profile.image,
        bookingSlug: profile.bookingSlug,
        bookingUrl: profile.bookingSlug ? `${baseUrl}/book/${profile.bookingSlug}` : null,
      };

      // Generate vCard string
      card.vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${card.name}`,
        `ORG:${card.company}`,
        `TITLE:${card.title}`,
        `EMAIL:${card.email}`,
        `TEL:${card.phone}`,
        'END:VCARD',
      ].join('\n');

      // Cache card data
      await SecureStore.setItemAsync(CARD_CACHE_KEY, JSON.stringify(card));
      return card;
    } catch {
      // Try cache
      const cached = await SecureStore.getItemAsync(CARD_CACHE_KEY);
      if (cached) return JSON.parse(cached);
      throw new Error('No se pudo obtener la tarjeta digital');
    }
  }

  /**
   * Get share links for the user
   */
  getShareLinks(card: DigitalCard): ShareLink[] {
    const links: ShareLink[] = [
      {
        label: 'Perfil Volkern',
        url: `https://volkern.app/u/${card.email.split('@')[0]}`,
        icon: 'person',
      },
    ];

    if (card.bookingUrl) {
      links.push({
        label: 'Agendar cita',
        url: card.bookingUrl,
        icon: 'calendar',
      });
    }

    if (card.phone) {
      links.push({
        label: 'Llamar',
        url: `tel:${card.phone}`,
        icon: 'call',
      });
    }

    links.push({
      label: 'Enviar correo',
      url: `mailto:${card.email}`,
      icon: 'mail',
    });

    return links;
  }

  /**
   * Generate vCard file content for sharing
   */
  getVCardDownloadUrl(card: DigitalCard): string {
    return `data:text/vcard;charset=utf-8,${encodeURIComponent(card.vcard || '')}`;
  }

  /**
   * Get the profile URL to encode in QR
   */
  getProfileUrl(card: DigitalCard): string {
    return `https://volkern.app/u/${card.email.split('@')[0]}`;
  }
}

export const shareService = new ShareService();

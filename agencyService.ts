import { AgencySettings } from './types';

export const DEFAULT_AGENCY_SETTINGS: AgencySettings = {
  agencyName: 'Quick Travel Cancún',
  faviconUrl: '/favicon.svg',
  logoUrl: '/favicon.svg',
  phoneNumber: '+52 998 212 7348',
  phoneDispatch: '529982127348',
  email: 'quicktravelincancun@gmail.com',
  website: 'https://quicktravelcancun.com',
  slogan: 'Transportación Ejecutiva, Privada y Tours en Cancún & Riviera Maya',
};

const STORAGE_KEY = 'qt_agency_settings';

/**
 * Returns saved agency settings or default values.
 */
export function getStoredAgencySettings(): AgencySettings {
  if (typeof window === 'undefined') return DEFAULT_AGENCY_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENCY_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_AGENCY_SETTINGS,
      ...parsed,
    };
  } catch (e) {
    console.error('Error reading agency settings from localStorage:', e);
    return DEFAULT_AGENCY_SETTINGS;
  }
}

/**
 * Persists agency settings and updates document favicon and title.
 */
export function saveAgencySettings(settings: AgencySettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyFavicon(settings.faviconUrl);
    if (settings.agencyName) {
      // Keep app name in document title if desired or reflect agency
      document.title = `${settings.agencyName} - Sistema de Reservaciones`;
    }
  } catch (e) {
    console.error('Error saving agency settings:', e);
  }
}

/**
 * Dynamically updates or creates the <link rel="icon"> element in <head>.
 */
export function applyFavicon(faviconUrl: string): void {
  if (typeof document === 'undefined' || !faviconUrl) return;
  try {
    const rels = ['icon', 'shortcut icon', 'apple-touch-icon'];
    rels.forEach(rel => {
      let link: HTMLLinkElement | null = document.querySelector(`link[rel='${rel}']`);
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
      if (faviconUrl.endsWith('.svg') || faviconUrl.startsWith('data:image/svg')) {
        link.type = 'image/svg+xml';
      } else if (faviconUrl.endsWith('.ico')) {
        link.type = 'image/x-icon';
      } else if (faviconUrl.endsWith('.png') || faviconUrl.startsWith('data:image/png')) {
        link.type = 'image/png';
      }
    });
  } catch (e) {
    console.warn('Could not update favicon:', e);
  }
}

/**
 * Converts a File to a Base64 data URL string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

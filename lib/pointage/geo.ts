/**
 * Géolocalisation du pointage : position courante, distances, géocodage des
 * adresses de chantier (mis en cache sur l'appareil) et chantier le plus proche.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Chantier } from '@/app/types';

/** Rayon par défaut (m) au-delà duquel un pointage est « hors zone ». */
export const RAYON_POINTAGE_DEFAUT = 300;
/** Statuts de chantier proposés au pointage. */
const STATUTS_POINTABLES = ['actif', 'sav'];

export function chantiersPointables(chantiers: Chantier[]): Chantier[] {
  return chantiers.filter(c => STATUTS_POINTABLES.includes(c.statut));
}

/** Distance en mètres entre deux coordonnées GPS (formule Haversine) */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const aClamped = Math.max(0, Math.min(1, a));
  return R * 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));
}

/** Géocode une adresse via Nominatim (OSM) — retourne lat/lng ou null */
export async function geocodeAddress(adresse: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr', 'User-Agent': 'SKDeco-Planning/1.0' } });
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    // ignore network errors
  }
  return null;
}

/** Obtient la position GPS courante — natif (iOS/Android) via expo-location, web via l'API navigateur. */
export async function getCurrentPosition(messageGeoIndispo: string, messageGeoRefusee: string): Promise<{ latitude: number; longitude: number }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      if (!navigator?.geolocation) { reject(new Error(messageGeoIndispo)); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        err => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error(messageGeoRefusee);
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

// ── Cache des coordonnées des chantiers (clé = id + adresse) ────────────────
const CLE_CACHE = 'sk_geocache_chantiers_v1';
type Coords = { lat: number; lng: number } | null;
let cache: Record<string, Coords> | null = null;

async function lireCache(): Promise<Record<string, Coords>> {
  if (cache) return cache;
  try { cache = JSON.parse((await AsyncStorage.getItem(CLE_CACHE)) || '{}'); } catch { cache = {}; }
  return cache!;
}
function ecrireCache() { AsyncStorage.setItem(CLE_CACHE, JSON.stringify(cache || {})).catch(() => {}); }

export function adresseChantier(c: Chantier): string {
  return [c.rue, c.codePostal, c.ville].filter(Boolean).join(', ') || c.adresse || '';
}
const cleCache = (c: Chantier) => `${c.id}|${adresseChantier(c)}`;

/** Coordonnées déjà connues (GPS saisi ou cache), sans appel réseau. */
async function coordsConnues(c: Chantier): Promise<Coords | undefined> {
  if (c.latitude != null && c.longitude != null) return { lat: c.latitude, lng: c.longitude };
  const k = cleCache(c);
  const cc = await lireCache();
  return k in cc ? cc[k] : undefined;
}

export interface ChantierProche { chantier: Chantier; distance: number }

/**
 * Chantiers pointables triés du plus proche au plus loin.
 * Les adresses jamais géocodées le sont au besoin (au plus `maxGeocodages`, en série).
 */
export async function chantiersParDistance(chantiers: Chantier[], lat: number, lng: number, rayon: number, maxGeocodages = 12): Promise<ChantierProche[]> {
  const liste = chantiersPointables(chantiers);
  const res: ChantierProche[] = [];
  const inconnus: Chantier[] = [];
  for (const c of liste) {
    const co = await coordsConnues(c);
    if (co === undefined) inconnus.push(c);
    else if (co) res.push({ chantier: c, distance: haversineDistance(lat, lng, co.lat, co.lng) });
  }
  const dejaDansRayon = () => res.some(r => r.distance <= rayon);
  let n = 0;
  for (const c of inconnus) {
    if (dejaDansRayon() || n >= maxGeocodages) break;
    const adr = adresseChantier(c);
    if (!adr) continue;
    n++;
    const co = await geocodeAddress(adr);
    const cc = await lireCache();
    cc[cleCache(c)] = co;
    ecrireCache();
    if (co) res.push({ chantier: c, distance: haversineDistance(lat, lng, co.lat, co.lng) });
  }
  return res.sort((a, b) => a.distance - b.distance);
}

/** « 250 m » ou « 2,4 km » */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

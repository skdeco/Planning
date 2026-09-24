import { Linking, Platform } from 'react-native';

/**
 * Ouvre une position GPS dans l'application de cartes du téléphone
 * (ou dans un onglet du navigateur sur ordinateur).
 * Corrige le cas iOS/Android où rien ne se passait faute d'appel à Linking.
 */
export function ouvrirPosition(latitude?: number | null, longitude?: number | null): void {
  if (latitude == null || longitude == null) return;
  const coords = `${latitude},${longitude}`;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(`https://www.google.com/maps?q=${coords}`, '_blank');
    return;
  }
  // iOS : Plans en priorité ; Android : intent géo natif. Repli navigateur dans les deux cas.
  const natif = Platform.OS === 'ios' ? `maps://?q=${coords}&ll=${coords}` : `geo:${coords}?q=${coords}`;
  Linking.openURL(natif).catch(() => {
    Linking.openURL(`https://www.google.com/maps?q=${coords}`).catch(() => {});
  });
}

/** Itinéraire en voiture avec Waze. */
export function ouvrirWaze(adresse: string): void {
  if (!adresse) return;
  const dest = encodeURIComponent(adresse);
  const web = `https://waze.com/ul?q=${dest}&navigate=yes`;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(web, '_blank');
    return;
  }
  Linking.openURL(`waze://?q=${dest}&navigate=yes`).catch(() => {
    Linking.openURL(web).catch(() => {});
  });
}

/** Itinéraire en voiture avec Plans (iOS) ou Google Maps (Android/web). */
export function ouvrirPlans(adresse: string): void {
  if (!adresse) return;
  const dest = encodeURIComponent(adresse);
  const web = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(web, '_blank');
    return;
  }
  if (Platform.OS === 'ios') {
    Linking.openURL(`maps://?daddr=${dest}`).catch(() => { Linking.openURL(web).catch(() => {}); });
    return;
  }
  Linking.openURL(`google.navigation:q=${dest}`).catch(() => { Linking.openURL(web).catch(() => {}); });
}

/** Itinéraire en voiture avec Google Maps. */
export function ouvrirGoogleMaps(adresse: string): void {
  if (!adresse) return;
  const dest = encodeURIComponent(adresse);
  const web = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(web, '_blank');
    return;
  }
  if (Platform.OS === 'ios') {
    Linking.openURL(`comgooglemaps://?daddr=${dest}&directionsmode=driving`).catch(() => {
      Linking.openURL(web).catch(() => {});
    });
    return;
  }
  Linking.openURL(`google.navigation:q=${dest}`).catch(() => { Linking.openURL(web).catch(() => {}); });
}

/** Itinéraire en transports en commun vers une adresse. */
export function ouvrirItineraireTransports(adresse: string): void {
  if (!adresse) return;
  const dest = encodeURIComponent(adresse);
  const web = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=transit`;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(web, '_blank');
    return;
  }
  if (Platform.OS === 'ios') {
    // Plans d'Apple : dirflg=r = transports en commun.
    Linking.openURL(`maps://?daddr=${dest}&dirflg=r`).catch(() => {
      Linking.openURL(web).catch(() => {});
    });
    return;
  }
  Linking.openURL(`google.navigation:q=${dest}&mode=t`).catch(() => {
    Linking.openURL(web).catch(() => {});
  });
}

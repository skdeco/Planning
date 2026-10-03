/**
 * Calcule une fois pour toutes les coordonnées GPS des chantiers en cours
 * (à la création ou au changement d'adresse) et les enregistre sur le chantier :
 * le téléphone des employés n'a plus rien à calculer au moment du pointage.
 * Monté pour l'admin et les RH uniquement.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '@/app/context/AppContext';
import { adresseChantier, chantiersPointables, geocodeAddress } from '@/lib/pointage/geo';

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

export function GeocodageChantiers() {
  const { data, updateChantier } = useApp();
  const enCours = useRef(false);
  const dejaTentes = useRef(new Set<string>());
  const chantiersRef = useRef(data.chantiers);
  chantiersRef.current = data.chantiers;

  useEffect(() => {
    if (enCours.current) return;
    const aFaire = chantiersPointables(data.chantiers).filter(c => {
      const adr = adresseChantier(c);
      if (!adr || dejaTentes.current.has(`${c.id}|${adr}`)) return false;
      if (c.latitude == null || c.longitude == null) return true;
      return c.geoAdresse != null && c.geoAdresse !== adr;
    });
    if (aFaire.length === 0) return;
    enCours.current = true;
    (async () => {
      for (const c of aFaire) {
        const adr = adresseChantier(c);
        dejaTentes.current.add(`${c.id}|${adr}`);
        const co = await geocodeAddress(adr);
        // Version la plus récente du chantier (il a pu être modifié entre-temps)
        const actuel = chantiersRef.current.find(x => x.id === c.id);
        if (co && actuel && adresseChantier(actuel) === adr) updateChantier({ ...actuel, latitude: co.lat, longitude: co.lng, geoAdresse: adr });
        await pause(1100); // Nominatim : 1 requête par seconde maximum
      }
      enCours.current = false;
    })();
  }, [data.chantiers]);

  return null;
}

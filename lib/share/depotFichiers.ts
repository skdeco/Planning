/**
 * Glisser-déposer de fichiers sur ordinateur (version web, Mac / Windows).
 *
 * Principe, valable pour tous les envois de l'app sans les réécrire :
 *  1. Des fichiers sont lâchés sur la page → ils sont mis « en attente ».
 *  2. On déclenche la zone d'envoi la plus proche du point de dépôt
 *     (zones enregistrées avec `useZoneDepot`, ex. « + Ajouter » des documents).
 *  3. Le prochain sélecteur de fichiers ouvert (n'importe quel <input type="file">)
 *     reçoit directement les fichiers en attente au lieu d'ouvrir la fenêtre.
 *  Sans zone proche, un bandeau invite à cliquer sur le bouton d'ajout voulu.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export type TypesDepot = 'tout' | 'images' | 'pdf';
type Zone = { el: HTMLElement; declencher: () => void; types: TypesDepot };
type Etat = { glisse: boolean; enAttente: number; noms: string[] };

let fichiers: File[] | null = null;
let expiration: ReturnType<typeof setTimeout> | null = null;
const zones = new Set<Zone>();
const abonnes = new Set<(e: Etat) => void>();
let etat: Etat = { glisse: false, enAttente: 0, noms: [] };
let installe = false;

const web = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined';

function publier(p: Partial<Etat>) {
  etat = { ...etat, ...p };
  abonnes.forEach(f => f(etat));
}
export function suivreDepot(f: (e: Etat) => void): () => void {
  abonnes.add(f); f(etat);
  return () => { abonnes.delete(f); };
}
export function annulerDepot() {
  fichiers = null;
  if (expiration) clearTimeout(expiration);
  publier({ enAttente: 0, noms: [] });
}

/** Un fichier correspond-il à l'attribut accept d'un input ? */
function accepte(f: File, accept: string): boolean {
  if (!accept) return true;
  const nom = f.name.toLowerCase();
  return accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).some(a => {
    if (a.startsWith('.')) return nom.endsWith(a);
    if (a.endsWith('/*')) return (f.type || '').startsWith(a.slice(0, -1));
    return f.type === a;
  });
}

function visible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/** Zone visible contenant le point, sinon la plus proche. */
const estImage = (f: File) => (f.type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name);
const estPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
function compatible(z: Zone, liste: File[]): boolean {
  if (z.types === 'images') return liste.some(estImage);
  if (z.types === 'pdf') return liste.some(estPdf);
  return true;
}

function zonePour(x: number, y: number, liste: File[]): Zone | null {
  let meilleure: Zone | null = null, dist = Infinity;
  zones.forEach(z => {
    if (!visible(z.el) || !compatible(z, liste)) return;
    const r = z.el.getBoundingClientRect();
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = Math.hypot(dx, dy);
    if (d < dist) { dist = d; meilleure = z; }
  });
  return meilleure;
}

/** À appeler une fois au démarrage (web uniquement). */
export function installerDepotFichiers(): void {
  if (!web() || installe) return;
  installe = true;

  // Le prochain sélecteur de fichiers reçoit les fichiers déposés
  const clicOrigine = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    if (this.type === 'file' && fichiers?.length) {
      const ok = fichiers.filter(f => accepte(f, this.accept));
      const choisis = this.multiple ? ok : ok.slice(0, 1);
      if (choisis.length) {
        const dt = new DataTransfer();
        choisis.forEach(f => dt.items.add(f));
        this.files = dt.files;
        annulerDepot();
        const input = this;
        setTimeout(() => input.dispatchEvent(new Event('change', { bubbles: true })), 0);
        return;
      }
    }
    return clicOrigine.call(this);
  };

  let profondeur = 0;
  const avecFichiers = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
  window.addEventListener('dragenter', e => { if (!avecFichiers(e)) return; profondeur++; publier({ glisse: true }); });
  window.addEventListener('dragleave', e => { if (!avecFichiers(e)) return; profondeur = Math.max(0, profondeur - 1); if (!profondeur) publier({ glisse: false }); });
  window.addEventListener('dragover', e => { if (!avecFichiers(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('drop', e => {
    if (!avecFichiers(e)) return;
    e.preventDefault();
    profondeur = 0;
    const liste = Array.from(e.dataTransfer?.files || []);
    publier({ glisse: false });
    if (!liste.length) return;
    fichiers = liste;
    if (expiration) clearTimeout(expiration);
    expiration = setTimeout(annulerDepot, 120_000);
    publier({ enAttente: liste.length, noms: liste.map(f => f.name) });
    const z = zonePour(e.clientX, e.clientY, liste);
    if (z) { try { z.declencher(); } catch { /* la zone gère ses erreurs */ } }
  });
}

/**
 * Fait d'un élément une zone de dépôt : lâcher des fichiers dessus (ou à côté)
 * lance `declencher` (la même action que le bouton « Ajouter »).
 * À brancher via `ref={useZoneDepot(ajouter)}` sur le bouton ou son bloc.
 */
export function useZoneDepot(declencher: () => void | Promise<unknown>, actif = true, types: TypesDepot = 'tout') {
  const fn = useRef(declencher);
  fn.current = declencher;
  const zone = useRef<Zone | null>(null);
  const ref = useCallback((noeud: unknown) => {
    if (zone.current) { zones.delete(zone.current); zone.current = null; }
    if (!web() || !actif || !(noeud instanceof HTMLElement)) return;
    zone.current = { el: noeud, declencher: () => { void fn.current(); }, types };
    zones.add(zone.current);
  }, [actif, types]);
  useEffect(() => () => { if (zone.current) zones.delete(zone.current); }, []);
  return ref;
}

/**
 * Espaces Travaux / Menuiserie — droits d'accès d'un compte connecté.
 *
 * Une personne a un seul identifiant, et un rôle par espace :
 *  - Travaux : le rôle historique du compte (admin, employé, sous-traitant, contact externe),
 *    sauf si `acces.travaux === false` (compte créé uniquement pour la Menuiserie) ;
 *  - Menuiserie : `acces.menuiserie` (absent = pas d'accès) ;
 *  - Planning direction : admins toujours, sinon `acces.planningDirection`.
 */
import type {
  AccesCompte, AppData, CurrentUser, EspaceId, RoleMenuiserie,
} from '@/app/types';

export interface DroitsEspaces {
  travaux: boolean;
  menuiserie?: RoleMenuiserie;
  planningDirection: boolean;
  /** Espaces accessibles, dans l'ordre d'affichage */
  espaces: EspaceId[];
}

/** Fiche (employé / contact / sous-traitant) liée à l'utilisateur connecté */
function accesDuCompte(cu: CurrentUser, data: AppData): AccesCompte | undefined {
  if (cu.role === 'apporteur' && cu.apporteurId) {
    return (data.apporteurs || []).find(a => a.id === cu.apporteurId)?.acces;
  }
  if (cu.role === 'soustraitant' && cu.soustraitantId) {
    return data.sousTraitants.find(s => s.id === cu.soustraitantId)?.acces;
  }
  if (cu.employeId) {
    return data.employes.find(e => e.id === cu.employeId)?.acces;
  }
  return undefined;
}

/** Compte admin principal (identifiant admin de la société) : accès à tout */
function estAdminPrincipal(cu: CurrentUser, data: AppData): boolean {
  return cu.role === 'admin' && (!cu.employeId || cu.employeId === data.adminEmployeId);
}

export function droitsEspaces(cu: CurrentUser | null, data: AppData): DroitsEspaces {
  if (!cu) return { travaux: false, planningDirection: false, espaces: [] };
  if (cu.role === 'menuiserie') {
    // Les administrateurs Menuiserie voient le Planning direction ; jamais l'espace Travaux
    return { travaux: false, menuiserie: cu.roleMenuiserie || 'client', planningDirection: cu.roleMenuiserie === 'admin', espaces: ['menuiserie'] };
  }
  if (estAdminPrincipal(cu, data)) {
    return { travaux: true, menuiserie: 'admin', planningDirection: true, espaces: ['travaux', 'menuiserie'] };
  }
  const acces = accesDuCompte(cu, data) || {};
  const travaux = acces.travaux !== false;
  // Rôle Menuiserie : fiche Travaux, ou compte Menuiserie relié à cette personne
  const menuiserie = acces.menuiserie || cu.roleMenuiserie;
  const planningDirection = cu.role === 'admin' || acces.planningDirection === true || menuiserie === 'admin';
  const espaces: EspaceId[] = [];
  if (travaux) espaces.push('travaux');
  if (menuiserie) espaces.push('menuiserie');
  // Filet de sécurité : un compte sans aucun espace retombe sur Travaux (comportement historique)
  if (espaces.length === 0) espaces.push('travaux');
  return { travaux: espaces.includes('travaux'), menuiserie, planningDirection, espaces };
}

/**
 * Clé d'identification d'un utilisateur dans les invitations du Planning direction.
 * Les employés gardent leur id brut (compatibilité avec les RDV existants).
 */
export function cleUtilisateur(cu: CurrentUser | null): string {
  if (!cu) return '';
  if (cu.role === 'apporteur' && cu.apporteurId) return `app:${cu.apporteurId}`;
  if (cu.role === 'soustraitant' && cu.soustraitantId) return `st:${cu.soustraitantId}`;
  if (cu.role === 'menuiserie') return `mn:${cu.compteMnId || cu.nom || 'compte'}`;
  if (cu.employeId) return cu.employeId;
  return 'admin';
}

export interface ParticipantDirection {
  cle: string;
  nom: string;
}

/** Personnes invitables dans le Planning direction : ceux qui y ont accès */
export function participantsDirection(data: AppData): ParticipantDirection[] {
  const out: ParticipantDirection[] = [];
  if (!data.adminEmployeId) out.push({ cle: 'admin', nom: 'Admin' });
  data.employes.forEach(e => {
    if (e.role === 'admin' || e.acces?.planningDirection) {
      out.push({ cle: e.id, nom: `${e.prenom} ${e.nom}`.trim() });
    }
  });
  (data.apporteurs || []).forEach(a => {
    if (a.acces?.planningDirection) out.push({ cle: `app:${a.id}`, nom: `${a.prenom} ${a.nom}`.trim() });
  });
  data.sousTraitants.forEach(s => {
    if (s.acces?.planningDirection) out.push({ cle: `st:${s.id}`, nom: `${s.prenom} ${s.nom}`.trim() || s.societe });
  });
  (data.contactsDirection || []).forEach(c => { if (!out.some(o => o.cle === c.cle)) out.push(c); });
  return out;
}

/** Nom affichable d'une clé utilisateur (invités, créateur…) */
export function nomParticipant(cle: string, data: AppData): string {
  if (cle === 'admin') return 'Admin';
  if (cle.startsWith('mn:')) return (data.contactsDirection || []).find(c => c.cle === cle)?.nom || 'Menuiserie';
  if (cle.startsWith('app:')) {
    const a = (data.apporteurs || []).find(x => x.id === cle.slice(4));
    return a ? `${a.prenom} ${a.nom}`.trim() : 'Contact';
  }
  if (cle.startsWith('st:')) {
    const s = data.sousTraitants.find(x => x.id === cle.slice(3));
    return s ? (`${s.prenom} ${s.nom}`.trim() || s.societe) : 'Sous-traitant';
  }
  const e = data.employes.find(x => x.id === cle);
  return e ? `${e.prenom} ${e.nom}`.trim() : 'Employé';
}

/**
 * Écran d'arrivée d'un espace. Chemins explicites : « / » est ambigu depuis
 * l'intérieur de (tabs) (il y désigne l'onglet Accueil, pas le routage central).
 */
export function routeEspace(espace: EspaceId, cu: CurrentUser): string {
  if (espace === 'menuiserie') return '/menuiserie';
  if (cu.role === 'apporteur') return '/(externe)/mes-chantiers';
  if (cu.role === 'soustraitant') return '/(tabs)/planning';
  return '/(tabs)';
}

/**
 * Compte Menuiserie qui correspond aussi à une personne de l'espace Travaux
 * (contact externe ou employé ayant l'accès Menuiserie dans sa fiche) :
 * même e-mail, même identifiant, ou à défaut même nom. La personne retrouve
 * alors Travaux | Menuiserie | Planning avec un seul identifiant.
 */
export function identiteTravauxPourCompteMn(
  data: AppData,
  compte: { nom: string; role: RoleMenuiserie; email: string | null; identifiant: string | null; auth_email?: string | null },
  saisie: string,
): CurrentUser | null {
  const norm = (s?: string | null) => (s || '').trim().toLowerCase();
  const cles = new Set([norm(compte.email), norm(compte.identifiant), norm(compte.auth_email), norm(saisie)].filter(Boolean));
  const memeNom = (a: string) => norm(a).replace(/\s+/g, ' ') === norm(compte.nom).replace(/\s+/g, ' ');
  const tous = data.apporteurs || [];
  // Même e-mail / identifiant : sûr. Même nom : seulement si unique et avec un accès app ou Menuiserie.
  const parNom = tous.filter(a => (a.accesApp || a.acces?.menuiserie) && memeNom(`${a.prenom} ${a.nom}`));
  const contact = tous.find(a => cles.has(norm(a.email)) || cles.has(norm(a.identifiant))) || (parNom.length === 1 ? parNom[0] : undefined);
  if (contact) return { role: 'apporteur', apporteurId: contact.id, nom: `${contact.prenom} ${contact.nom}`.trim(), roleMenuiserie: compte.role };
  const employes = data.employes.filter(e => !!e.acces?.menuiserie);
  const empNom = employes.filter(e => memeNom(`${e.prenom} ${e.nom}`));
  const emp = employes.find(e => cles.has(norm(e.email)) || cles.has(norm(e.identifiant))) || (empNom.length === 1 ? empNom[0] : undefined);
  if (emp) return { role: emp.role, employeId: emp.id, nom: `${emp.prenom} ${emp.nom}`.trim(), roleMenuiserie: compte.role };
  return null;
}

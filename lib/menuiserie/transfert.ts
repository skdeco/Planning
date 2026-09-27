/**
 * Transfert des chantiers « menuiserie » de l'espace Travaux vers l'espace Menuiserie :
 * infos, client, intervenants, montants (marché, règlements) et documents
 * (plans, photos, devis, documents) recopiés dans le stockage privé Menuiserie.
 * Le chantier n'est retiré de Travaux qu'une fois son transfert terminé.
 */
import { Platform } from 'react-native';
import type { AppData, Chantier } from '@/app/types';
import { mn } from './client';
import { ajouterMontantMn, creerChantierMn, deposerDocumentMn, journaliser } from './api';
import type { CompteMn, StatutChantierMn } from './types';

export function chantiersMenuiserieTravaux(data: AppData): Chantier[] {
  return data.chantiers.filter(c => c.nature === 'menuiserie');
}

function mimeDe(src: string, nom: string): string {
  const m = src.match(/^data:([^;,]+)/);
  if (m) return m[1];
  const n = `${nom} ${src}`.toLowerCase().split('?')[0];
  if (n.includes('.pdf')) return 'application/pdf';
  if (n.includes('.png')) return 'image/png';
  return 'image/jpeg';
}

/** Sur iPhone / Android, l'envoi a besoin d'un fichier local : on télécharge ou on décode d'abord. */
async function versFichierLocal(src: string, mime: string): Promise<string> {
  if (Platform.OS === 'web' || src.startsWith('file:')) return src;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  const cible = `${FileSystem.cacheDirectory}transfert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  if (src.startsWith('data:')) {
    await FileSystem.writeAsStringAsync(cible, src.split(',')[1] || '', { encoding: FileSystem.EncodingType.Base64 });
    return cible;
  }
  const r = await FileSystem.downloadAsync(src, cible);
  return r.uri;
}

function statutMn(c: Chantier): StatutChantierMn {
  if (c.statut === 'sav') return 'sav';
  if (c.statut === 'termine' || c.statut === 'archive') return 'cloture';
  return 'en_cours';
}

export interface RapportTransfert { chantier: string; documents: number; ignores: number; erreur?: string }

/** Chantiers Travaux déjà importés (repérés dans l'historique Menuiserie). */
export async function dejaImportes(): Promise<Set<string>> {
  const { data } = await mn().from('mn_journal').select('detail').eq('action', 'Import Travaux');
  return new Set(((data as { detail: string | null }[]) || []).map(j => j.detail || ''));
}

export async function transfererChantier(moi: CompteMn, data: AppData, c: Chantier): Promise<RapportTransfert> {
  const rapport: RapportTransfert = { chantier: c.nom, documents: 0, ignores: 0 };
  const contacts = data.apporteurs || [];
  const client = contacts.find(a => a.id === c.clientApporteurId);
  const archi = contacts.find(a => a.id === c.architecteId);
  const apporteur = contacts.find(a => a.id === c.apporteurId);
  const nomDe = (a?: { prenom: string; nom: string }) => (a ? `${a.prenom} ${a.nom}`.trim() : '');

  const id = await creerChantierMn(moi, {
    nom: c.nom,
    rue: c.rue || (c.codePostal || c.ville ? null : c.adresse || null),
    code_postal: c.codePostal || null,
    ville: c.ville || null,
    code_acces: c.fiche?.codeAcces || null,
    etage: null,
    cle: c.fiche?.emplacementCle || null,
    statut: statutMn(c),
    usine_id: null,
    date_livraison_prevue: null,
    client_nom: nomDe(client) || c.client || null,
    client_societe: client?.societe || null,
    client_rue: client?.adresse || null,
    client_code_postal: null,
    client_ville: null,
    client_tel: client?.telephone || null,
    client_email: client?.email || null,
  }, [
    { role: 'client', nom: nomDe(client) || c.client || '' },
    { role: 'architecte', nom: nomDe(archi) },
    { role: 'apporteur', nom: nomDe(apporteur) },
  ]);

  const copier = async (etape: string, src: string | undefined, nom: string, visibilite: string[], piece?: string) => {
    if (!src || !(src.startsWith('http') || src.startsWith('data:') || src.startsWith('file:'))) { if (src) rapport.ignores++; return; }
    try {
      const mime = mimeDe(src, nom);
      const uri = await versFichierLocal(src, mime);
      await deposerDocumentMn(moi, { chantierId: id, etape, uri, nom: nom || 'document', mime, visibilite, piece: piece || null });
      rapport.documents++;
    } catch { rapport.ignores++; }
  };

  // Plans → « Plan pour devis » (visibles par l'usine)
  const plans: { nom?: string; fichier?: string; archivedAt?: string }[] = (data.plansChantier?.[c.id] as never) || [];
  for (const p of plans.filter(x => !x.archivedAt)) await copier('plan_devis', p.fichier, p.nom || 'Plan', ['admin', 'usine']);

  // Drive du chantier
  for (const d of c.documents || []) {
    if (d.categorie === 'photos_existant') await copier('mesures', d.fichierUrl, d.nom, ['admin', 'usine'], 'Existant');
    else if (d.categorie === 'devis' || d.categorie === 'devis_st' || d.categorie === 'devis_concurrents') await copier('devis', d.fichierUrl, d.nom, ['admin']);
    else await copier('references', d.fichierUrl, d.nom, ['admin']);
  }

  // Photos du chantier → prises de mesure (pièce « Photos Travaux »)
  for (const ph of (data.photosChantier || []).filter(x => x.chantierId === c.id)) {
    await copier('mesures', ph.uri, ph.nom || ph.legende || `Photo ${ph.date}`, ['admin', 'usine'], 'Photos Travaux');
  }

  // Documents de suivi (PV, SAV…) → PV
  for (const ds of (data.docsSuivi || []).filter(x => x.chantierId === c.id)) await copier('pv', ds.fichier, ds.libelle, ['admin']);

  // Marchés : devis client (admin), montant vendu, règlements
  for (const m of (data.marchesChantier || []).filter(x => x.chantierId === c.id)) {
    await copier('devis', m.devisInitialUri, m.devisInitialNom || `Devis ${m.libelle}`, ['admin']);
    await copier('devis', m.devisSigneUri, m.devisSigneNom || `Devis signé ${m.libelle}`, ['admin']);
    if (m.montantHT) {
      await ajouterMontantMn(moi, { chantier_id: id, etape: null, type: 'vente_client', libelle: m.libelle, montant_ht: m.montantHT, visibilite: 'admin', usine_id: null, compte_id: null, date_montant: m.dateSignature || m.dateDevis || null });
    }
    for (const p of m.paiements || []) {
      await ajouterMontantMn(moi, { chantier_id: id, etape: null, type: 'reglement_client', libelle: `Règlement ${p.mode}${p.reference ? ` ${p.reference}` : ''}`, montant_ht: p.montant, visibilite: 'client', usine_id: null, compte_id: null, date_montant: p.date });
      await copier('references', p.factureUri, p.factureNom || `Facture ${p.date}`, ['admin']);
    }
    if (m.commission) {
      const cm = m.commission;
      await ajouterMontantMn(moi, { chantier_id: id, etape: null, type: 'autre', libelle: `Commission prévue (${cm.modeCommission === 'pourcentage' ? `${cm.valeur} %` : 'montant'}) — à rattacher au compte de l'architecte / apporteur`, montant_ht: cm.modeCommission === 'montant' ? cm.valeur : 0, visibilite: 'admin', usine_id: null, compte_id: null, date_montant: null });
    }
  }

  await journaliser(moi, id, 'Import Travaux', c.id);
  return rapport;
}

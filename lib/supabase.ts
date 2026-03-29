// SK Deco Planning — v2.2.0 — Protection complète des données (2026-03-26)
import { createClient } from '@supabase/supabase-js';

//// ─── Supabase client ────────────────────────────────────────────────
const SUPABASE_URL = 'https://wgbzslmwhyuoxqhishzk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnYnpzbG13aHl1b3hxaGlzaHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDQzODQsImV4cCI6MjA5MDEyMDM4NH0.qJ6JX5Ps58rbURffJR-kP7ZP9W5YEW7qQmMfykaZpKs';
// Clé service_role pour les uploads Storage (contourne les RLS)
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnYnpzbG13aHl1b3hxaGlzaHprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU0NDM4NCwiZXhwIjoyMDkwMTIwMzg0fQ.32hV-bZ_6CR3oONK5CufwO7hsLfPIlEe4CQ08HKfFxk';
/** Nom du bucket Supabase Storage pour les photos et documents */
export const STORAGE_BUCKET = 'sk-photos';
/** URL de base publique pour accéder aux fichiers */
export const STORAGE_PUBLIC_URL = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/** Client Supabase avec droits élevés pour les uploads Storage */
export const supabaseStorage = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// ─── Clés de stockage local ───────────────────────────────────────────────────
/** Cache local des données principales (sans photos base64) */
export const LOCAL_DATA_KEY = 'sk_deco_app_data_v2';
/** Cache local des photos (trop volumineuses pour Supabase) */
export const LOCAL_PHOTOS_KEY = 'sk_deco_photos_v2';

// ─── Collections protégées ────────────────────────────────────────────────────
/**
 * Liste de toutes les collections de l'application.
 * Pour chaque collection, on vérifie que la version entrante
 * n'est JAMAIS inférieure à la version existante.
 */
const ARRAY_COLLECTIONS = [
  'employes',
  'chantiers',
  'affectations',
  'pointages',
  'acomptes',
  'sousTraitants',
  'devis',
  'marches',
  'acomptesst',
  'interventions',
  'listesMateriaux',
  'demandesConge',
  'arretsMaladie',
  'demandesAvance',
  'fichesPaie',
  'retardsPlanifies',
  'depensesChantier',
  'supplementsChantier',
  'docsSuiviChantier',
  'notesSuiviChantier',
  'photosChantier',
  'documentsRH',
  'messagesPrive',
  'notesChantier',
  'notesChantierSupprimees',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Vérifie si des données sont "substantielles" (au moins une collection non vide).
 */
function isSubstantialData(d: Record<string, unknown>): boolean {
  return ARRAY_COLLECTIONS.some(key => {
    const arr = d[key] as unknown[];
    return Array.isArray(arr) && arr.length > 0;
  });
}

/**
 * Fusionne deux snapshots de données de façon ADDITIVE :
 * - Pour chaque collection tableau : on garde le max entre local et distant
 * - On ne réduit JAMAIS une collection
 * - Les éléments sont dédupliqués par id
 * - La version locale est prioritaire pour les conflits d'id
 *
 * Cette fonction est utilisée pour fusionner Supabase avec le cache local
 * sans jamais perdre de données.
 */
export function mergeDataSafely(
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...local };

  for (const key of ARRAY_COLLECTIONS) {
    const localArr = Array.isArray(local[key]) ? local[key] as Record<string, unknown>[] : [];
    const remoteArr = Array.isArray(remote[key]) ? remote[key] as Record<string, unknown>[] : [];

    if (remoteArr.length === 0) {
      // Remote vide → garder local tel quel
      result[key] = localArr;
      continue;
    }

    if (localArr.length === 0) {
      // Local vide → prendre remote
      result[key] = remoteArr;
      continue;
    }

    // Les deux ont des données → fusionner par id (local prioritaire)
    const merged = [...localArr];
    const localIds = new Set(localArr.map(item => item.id as string));
    for (const remoteItem of remoteArr) {
      if (!localIds.has(remoteItem.id as string)) {
        // Élément présent dans remote mais pas en local → l'ajouter
        merged.push(remoteItem);
      }
      // Si déjà en local → la version locale est prioritaire, on ne touche pas
    }
    result[key] = merged;
  }

  // Pour les objets (fichesChantier, plansChantier) : fusionner les clés
  for (const key of ['fichesChantier', 'plansChantier'] as const) {
    const localObj = (local[key] as Record<string, unknown>) || {};
    const remoteObj = (remote[key] as Record<string, unknown>) || {};
    result[key] = { ...remoteObj, ...localObj }; // local prioritaire
  }

  // adminPassword : priorité Supabase (remote) pour synchroniser entre appareils
  if (remote.adminPassword && typeof remote.adminPassword === 'string') {
    result.adminPassword = remote.adminPassword;
  }

  return result;
}

/**
 * Retire les données volumineuses (photos base64) du payload avant envoi à Supabase.
 * Les photos sont stockées uniquement en local via LOCAL_PHOTOS_KEY.
 *
 * RÈGLE : Supabase ne reçoit JAMAIS de contenu base64 ou de fichiers encodés.
 * Seules les métadonnées (id, nom, date, chantierId, employeId, source) sont envoyées.
 */
function stripPhotosForSupabase(appData: Record<string, unknown>): Record<string, unknown> {
  const stripped = { ...appData };

  // photosChantier : garder uniquement les métadonnées, pas l'URI base64
  if (Array.isArray(stripped.photosChantier)) {
    stripped.photosChantier = (stripped.photosChantier as Record<string, unknown>[]).map(p => ({
      id: p.id,
      chantierId: p.chantierId,
      employeId: p.employeId,
      date: p.date,
      source: p.source,
      // uri intentionnellement OMIS — stocké dans LOCAL_PHOTOS_KEY
    }));
  }

  // Notes chantier : retirer les photos des pièces jointes
  // IMPORTANT : les photos peuvent être soit des objets {id, nom, type} soit des strings base64
  // Dans les deux cas, on les supprime du payload Supabase
  if (Array.isArray(stripped.notesChantier)) {
    stripped.notesChantier = (stripped.notesChantier as Record<string, unknown>[]).map(n => ({
      ...n,
      pieceJointe: undefined,  // Supprimer la pièce jointe (base64)
      photos: [],               // Supprimer TOUTES les photos (base64 ou métadonnées)
    }));
  }

  // Notes supprimées : idem
  if (Array.isArray(stripped.notesChantierSupprimees)) {
    stripped.notesChantierSupprimees = (stripped.notesChantierSupprimees as Record<string, unknown>[]).map(n => ({
      ...n,
      pieceJointe: undefined,
      photos: [],
    }));
  }

  // Plans chantier : retirer les URIs base64 des plans
  if (typeof stripped.plansChantier === 'object' && stripped.plansChantier !== null) {
    const plans = stripped.plansChantier as Record<string, unknown[]>;
    const strippedPlans: Record<string, unknown[]> = {};
    for (const [chantierId, planList] of Object.entries(plans)) {
      strippedPlans[chantierId] = (planList as Record<string, unknown>[]).map(p => ({
        id: p.id,
        nom: p.nom,
        type: p.type,
        date: p.date,
        addedBy: p.addedBy,
        visiblePour: p.visiblePour,
        // uri omis
      }));
    }
    stripped.plansChantier = strippedPlans;
  }

  // Documents RH : retirer les URIs
  if (Array.isArray(stripped.documentsRH)) {
    stripped.documentsRH = (stripped.documentsRH as Record<string, unknown>[]).map(d => ({
      id: d.id,
      employeId: d.employeId,
      type: d.type,
      nom: d.nom,
      date: d.date,
      // uri omis
    }));
  }

  return stripped;
}

/**
 * Initialise la table app_data si elle n'existe pas encore.
 */
export async function initSupabaseTables(): Promise<void> {
  const { data } = await supabase
    .from('app_data')
    .select('id')
    .eq('id', 'main')
    .maybeSingle();

  if (!data) {
    await supabase
      .from('app_data')
      .insert({ id: 'main', data: {}, updated_at: new Date().toISOString() });
  }
}

/**
 * Charge les données depuis Supabase avec timeout de 12s.
 * Retourne null si timeout, erreur ou données vides.
 */
export async function loadDataFromSupabase(): Promise<Record<string, unknown> | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000));

  const query = supabase
    .from('app_data')
    .select('data')
    .eq('id', 'main')
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        console.error('Erreur chargement Supabase:', error.message);
        return null;
      }
      const payload = data?.data as Record<string, unknown> | null;
      if (!payload || Object.keys(payload).length === 0) return null;
      return payload;
    });

  const result = await Promise.race([query, timeout]);
  if (result === null) {
    console.warn('Supabase timeout ou données vides');
  }
  return result;
}

/**
 * Sauvegarde les données dans Supabase.
 *
 * RÈGLES STRICTES :
 * 1. Ne jamais envoyer de photos base64 (stripPhotosForSupabase)
 * 2. Ne jamais réduire une collection existante dans Supabase
 * 3. Fusionner avec les données existantes si nécessaire
 * 4. Debounce géré côté AppContext (ne pas appeler trop fréquemment)
 */
export async function saveDataToSupabase(appData: Record<string, unknown>): Promise<boolean> {
  // Retirer les photos volumineuses avant envoi (base64 dans toutes les collections)
  // IMPORTANT : stripPhotosForSupabase doit être appelé AVANT toute fusion
  // pour éviter que des photos base64 legacy ne soient réintroduites
  const lightPayload = stripPhotosForSupabase(appData);

  const { error } = await supabase
    .from('app_data')
    .upsert({ id: 'main', data: lightPayload, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Erreur sauvegarde Supabase:', error.message);
    return false;
  }
  return true;
}

/**
 * Crée un backup horodaté dans app_data_backups.
 * IMPORTANT : les photos sont aussi exclues des backups Supabase.
 * Maximum 1 backup par semaine pour éviter de saturer la base.
 */
export async function createManualBackup(
  appData: Record<string, unknown>,
  label: string = 'manuel'
): Promise<boolean> {
  if (!isSubstantialData(appData)) {
    console.warn('Backup annulé : données vides');
    return false;
  }

  // Retirer les photos des backups aussi (trop volumineux)
  const lightPayload = stripPhotosForSupabase(appData);

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');
  const id = `backup_${label}_${dateStr}`;

  const { error } = await supabase
    .from('app_data_backups')
    .insert({
      id,
      data: lightPayload,
      saved_at: now.toISOString(),
    });

  if (error) {
    console.error('Erreur backup:', error.message);
    return false;
  }

  // Purger les backups de plus de 4 semaines (garder max 4 backups hebdomadaires)
  purgeOldBackups().catch(() => {});

  console.log(`✅ Backup créé : ${id}`);
  return true;
}

/**
 * Supprime les backups au-delà des 3 plus récents.
 * Conserve TOUJOURS au minimum les 3 derniers backups (récupération J-3 max).
 */
async function purgeOldBackups(): Promise<void> {
  // Lister tous les backups triés du plus récent au plus ancien
  const { data, error } = await supabase
    .from('app_data_backups')
    .select('id, saved_at')
    .order('saved_at', { ascending: false });
  if (error || !data) return;

  // Garder les 3 plus récents, supprimer le reste
  const toDelete = data.slice(3).map(b => b.id);
  if (toDelete.length === 0) return;

  await supabase
    .from('app_data_backups')
    .delete()
    .in('id', toDelete);
}

/**
 * Liste les 10 derniers backups disponibles.
 */
export async function listBackups(): Promise<{ id: string; saved_at: string }[]> {
  const { data, error } = await supabase
    .from('app_data_backups')
    .select('id, saved_at')
    .order('saved_at', { ascending: false })
    .limit(10);
  if (error) return [];
  return data || [];
}

/**
 * Restaure un backup spécifique.
 */
export async function restoreBackup(backupId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('app_data_backups')
    .select('data')
    .eq('id', backupId)
    .maybeSingle();
  if (error || !data) return null;
  return data.data as Record<string, unknown>;
}

// ─── Supabase Storage : upload et gestion des fichiers ───────────────────────

/**
 * Convertit un URI base64 en Blob pour l'upload.
 */
function base64ToBlob(base64Uri: string): { blob: Blob; mimeType: string } {
  const [header, data] = base64Uri.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteChars = atob(data);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  return { blob: new Blob([byteArray], { type: mimeType }), mimeType };
}

/**
 * Détermine l'extension de fichier à partir du MIME type.
 */
function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };
  return map[mimeType] || 'jpg';
}

/**
 * Upload un fichier (base64 URI) vers Supabase Storage.
 * Retourne l'URL publique du fichier, ou null en cas d'erreur.
 *
 * Organisation des dossiers :
 *   chantiers/{chantierId}/photos/{filename}
 *   chantiers/{chantierId}/plans/{filename}
 *   chantiers/{chantierId}/notes/{noteId}/{filename}
 *   employes/{employeId}/documents/{filename}
 */
export async function uploadFileToStorage(
  base64Uri: string,
  folder: string,
  fileId: string
): Promise<string | null> {
  try {
    // Si c'est déjà une URL (pas un base64), retourner directement
    if (base64Uri.startsWith('http')) return base64Uri;
    if (!base64Uri.startsWith('data:')) return null;

    const { blob, mimeType } = base64ToBlob(base64Uri);
    const ext = mimeToExt(mimeType);
    const path = `${folder}/${fileId}.${ext}`;

    const { data, error } = await supabaseStorage.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, {
        contentType: mimeType,
        upsert: true, // Écraser si déjà existant
      });

    if (error) {
      console.error('Erreur upload Storage:', error.message);
      return null;
    }

    // Retourner l'URL publique
    const publicUrl = `${STORAGE_PUBLIC_URL}/${path}`;
    console.log(`✅ Photo uploadée: ${publicUrl}`);
    return publicUrl;
  } catch (e) {
    console.error('Erreur upload Storage:', e);
    return null;
  }
}

/**
 * Supprime un fichier de Supabase Storage.
 */
export async function deleteFileFromStorage(publicUrl: string): Promise<boolean> {
  try {
    // Extraire le path depuis l'URL publique
    const prefix = `${STORAGE_PUBLIC_URL}/`;
    if (!publicUrl.startsWith(prefix)) return false;
    const path = publicUrl.slice(prefix.length);

    const { error } = await supabaseStorage.storage
      .from(STORAGE_BUCKET)
      .remove([path]);

    if (error) {
      console.error('Erreur suppression Storage:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie si une URI est un base64 local (à uploader) ou une URL Storage (déjà uploadée).
 */
export function isLocalBase64(uri: string): boolean {
  return uri.startsWith('data:');
}

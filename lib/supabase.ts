// SK Deco Planning — v2.3.1 — Fix persistence polling (2026-04-01)
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

//// ─── Supabase client ────────────────────────────────────────────────
const SUPABASE_URL = 'https://wgbzslmwhyuoxqhishzk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnYnpzbG13aHl1b3hxaGlzaHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDQzODQsImV4cCI6MjA5MDEyMDM4NH0.qJ6JX5Ps58rbURffJR-kP7ZP9W5YEW7qQmMfykaZpKs';
// NOTE: La clé service_role a été retirée du code client pour des raisons de sécurité.
// Les uploads Storage utilisent désormais le client anon avec des policies RLS sur le bucket.
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

/** Client Supabase pour les uploads Storage (utilise anon key + policies RLS sur le bucket) */
export const supabaseStorage = supabase;

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
  'activityLog',
  'marchesChantier',
  'supplementsMarche',
  'ticketsSAV',
  'catalogueArticles',
  'agendaEvents',
  // Collections précédemment absentes → non protégées contre l'écrasement multi-admin.
  // Toutes possèdent un champ `id` (fusion par id sûre). Exclues volontairement :
  // presencesForcees / fournisseurs / chantierOrderPlanning (pas d'id / string[]).
  'depenses',
  'supplements',
  'docsSuivi',
  'notesSuivi',
  'documentsSociete',
  'livraisons',
  'rdvChantiers',
  'rdvsChantier',
  'suivisCR',
  'badgesEmployes',
  'metiersPerso',
  'apporteurs',
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

    // Les deux ont des données → fusionner par id
    // Si un item a un champ updatedAt, la version la plus récente gagne
    // Sinon, la version locale est prioritaire (rétro-compatible)
    const localMap = new Map(localArr.map(item => [item.id as string, item]));
    const remoteMap = new Map(remoteArr.map(item => [item.id as string, item]));
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
    const merged: Record<string, unknown>[] = [];
    for (const id of allIds) {
      const localItem = localMap.get(id);
      const remoteItem = remoteMap.get(id);
      if (!localItem) { merged.push(remoteItem!); continue; }
      if (!remoteItem) { merged.push(localItem); continue; }
      // Les deux existent → comparer par updatedAt si disponible
      const localTs = (localItem.updatedAt as string) || '';
      const remoteTs = (remoteItem.updatedAt as string) || '';
      if (localTs && remoteTs) {
        merged.push(remoteTs > localTs ? remoteItem : localItem);
      } else {
        // Pas de timestamp → local prioritaire (comportement historique)
        merged.push(localItem);
      }
    }
    result[key] = merged;
  }

  // Journal d'activité : borné à 200 entrées (le cap local slice(-199) est sinon
  // défait par la fusion additive → la cellule jsonb 'main' grossirait sans limite,
  // alourdissant chaque load/save pour tout le monde).
  if (Array.isArray(result.activityLog) && result.activityLog.length > 200) {
    result.activityLog = (result.activityLog as Record<string, unknown>[])
      .slice()
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
      .slice(-200);
  }

  // Pour les objets (fichesChantier, plansChantier) : fusionner les clés
  for (const key of ['fichesChantier', 'plansChantier'] as const) {
    const localObj = (local[key] as Record<string, unknown>) || {};
    const remoteObj = (remote[key] as Record<string, unknown>) || {};
    result[key] = { ...remoteObj, ...localObj }; // local prioritaire
  }

  // adminPassword : le côté avec l'horodatage le plus récent gagne
  // Si pas de timestamp, on compare les valeurs : remote gagne par défaut pour la synchro multi-appareils
  const localPwTs = (local.adminPasswordUpdatedAt as string) || '';
  const remotePwTs = (remote.adminPasswordUpdatedAt as string) || '';
  if (remote.adminPassword && typeof remote.adminPassword === 'string') {
    if (remotePwTs >= localPwTs) {
      result.adminPassword = remote.adminPassword;
      if (remotePwTs) result.adminPasswordUpdatedAt = remotePwTs;
    }
    // Sinon local est plus récent → on garde local (déjà dans result via spread)
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

  // photosChantier : garder les métadonnées + URI si c'est une URL Storage (pas base64)
  if (Array.isArray(stripped.photosChantier)) {
    stripped.photosChantier = (stripped.photosChantier as Record<string, unknown>[]).map(p => {
      const uri = p.uri as string | undefined;
      const isStorageUrl = uri && (uri.startsWith('http://') || uri.startsWith('https://'));
      return {
        id: p.id,
        chantierId: p.chantierId,
        employeId: p.employeId,
        date: p.date,
        nom: p.nom,
        legende: p.legende,
        createdAt: p.createdAt,
        source: p.source,
        // Garder l'URI si c'est une URL Storage, sinon l'omettre (base64 trop volumineux)
        ...(isStorageUrl ? { uri } : {}),
      };
    });
  }

  // Notes chantier : préserver les URLs Supabase Storage, retirer les
  // data: URIs base64 legacy (payload bloat). Pattern aligné sur
  // photosChantier ci-dessus.
  const isStorageUrl = (u: unknown): u is string =>
    typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://'));
  if (Array.isArray(stripped.notesChantier)) {
    stripped.notesChantier = (stripped.notesChantier as Record<string, unknown>[]).map(n => {
      const pieceJointe = n.pieceJointe;
      const photos = (n.photos as unknown[] | undefined) || [];
      return {
        ...n,
        pieceJointe: isStorageUrl(pieceJointe) ? pieceJointe : undefined,
        photos: photos.filter(isStorageUrl),
      };
    });
  }

  // Notes supprimées : idem
  if (Array.isArray(stripped.notesChantierSupprimees)) {
    stripped.notesChantierSupprimees = (stripped.notesChantierSupprimees as Record<string, unknown>[]).map(n => {
      const pieceJointe = n.pieceJointe;
      const photos = (n.photos as unknown[] | undefined) || [];
      return {
        ...n,
        pieceJointe: isStorageUrl(pieceJointe) ? pieceJointe : undefined,
        photos: photos.filter(isStorageUrl),
      };
    });
  }

  // Plans chantier : préserver les URLs Supabase Storage dans `fichier`,
  // retirer les data: URIs base64 legacy. Pattern aligné sur notesChantier.
  if (typeof stripped.plansChantier === 'object' && stripped.plansChantier !== null) {
    const plans = stripped.plansChantier as Record<string, unknown[]>;
    const strippedPlans: Record<string, unknown[]> = {};
    for (const [chantierId, planList] of Object.entries(plans)) {
      strippedPlans[chantierId] = (planList as Record<string, unknown>[]).map(p => ({
        ...p,
        fichier: isStorageUrl(p.fichier) ? p.fichier : undefined,
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
 *
 * ÉCRITURE SÛRE MULTI-ADMIN (Lot 8) :
 * Avant d'écrire, on relit l'état distant et on le fusionne avec le local
 * (`mergeDataSafely`, local prioritaire). Ainsi, si un 2e admin (ex : le frère)
 * a ajouté des données depuis notre dernière synchro, ses ajouts ne sont PAS
 * écrasés. `deletedIds` contient les ids supprimés localement : on les retire
 * après fusion pour que la fusion additive ne ressuscite pas une suppression.
 * Si la lecture distante échoue (timeout/vide), on retombe sur l'écriture
 * directe du local (comportement historique) pour ne pas bloquer la sauvegarde.
 */
export async function saveDataToSupabase(
  appData: Record<string, unknown>,
  deletedIds?: Set<string>,
): Promise<boolean> {
  // Relire le distant pour fusionner les ajouts concurrents d'un autre admin.
  let payload = appData;
  let mergedWithRemote = false;
  try {
    const remote = await loadDataFromSupabase();
    if (remote) {
      const merged = mergeDataSafely(appData, remote);
      // Retirer les suppressions locales que la fusion additive aurait ramenées.
      if (deletedIds && deletedIds.size > 0) {
        for (const key of ARRAY_COLLECTIONS) {
          if (Array.isArray(merged[key])) {
            merged[key] = (merged[key] as Record<string, unknown>[]).filter(
              item => !deletedIds.has(item.id as string),
            );
          }
        }
      }
      payload = merged;
      mergedWithRemote = true;
    }
  } catch (e) {
    // Lecture distante impossible → écriture directe du local (fallback sûr).
    console.warn('[Save] Fusion distante impossible, écriture directe:', e);
  }

  // Garde anti-écrasement : loadDataFromSupabase() renvoie null sur timeout/vide
  // SANS lever d'exception. Si on n'a donc PAS pu relire le distant ET que le
  // payload local n'est pas substantiel, on refuse d'écraser la ligne unique
  // 'main' avec des données potentiellement vides (ex : appareil neuf + réseau
  // lent au démarrage). On retourne false pour que la file de retry retente.
  if (!mergedWithRemote && !isSubstantialData(payload)) {
    console.warn('[Save] Relecture distante impossible et données locales vides → upsert annulé (anti-écrasement).');
    return false;
  }

  // Retirer les photos volumineuses avant envoi (base64 dans toutes les collections)
  const lightPayload = stripPhotosForSupabase(payload);

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
 * Souscription Supabase Realtime : écoute les changements sur la ligne `main` de `app_data`.
 * Appelle `onUpdate` quand un UPDATE est détecté (= un autre utilisateur a sauvegardé).
 * Retourne une fonction de cleanup.
 */
export function subscribeToRealtimeUpdates(onUpdate: () => void): () => void {
  const channel = supabase
    .channel('app_data_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      () => { onUpdate(); }
    )
    .subscribe((status) => {
      console.log('[Realtime] status:', status);
      if (status === 'CHANNEL_ERROR') {
        // Realtime indisponible — le polling prend le relais
        console.warn('[Realtime] Connexion échouée, le polling sera utilisé');
      }
    });

  return () => { supabase.removeChannel(channel); };
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
/**
 * Upload un fichier vers Supabase Storage.
 * - Web : data: URI → Blob → SDK upload
 * - Mobile : file:// URI → fetch REST API direct (contourne le SDK)
 */
export async function uploadFileToStorage(
  uri: string,
  folder: string,
  fileId: string,
  /**
   * Type MIME connu de l'appelant (ex: 'application/pdf'). Utilisé pour choisir
   * l'extension quand l'URI n'en porte pas de fiable (cache DocumentPicker) —
   * évite qu'un PDF soit stocké/joint en .jpg (illisible).
   */
  mimeTypeHint?: string,
): Promise<string | null> {
  try {
    if (uri.startsWith('http')) return uri;

    if (uri.startsWith('data:')) {
      // Parse header seulement (PAS de construction de Blob ici — celui-ci
      // crash sur React Native iOS dès que la string base64 dépasse ~quelques
      // mégaoctets — "Creating blobs from strings longer than ... not supported").
      // La construction du Blob est repoussée dans la branche web uniquement.
      const [header, base64DataInline] = uri.split(',');
      const mimeMatch = header.match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const ext = mimeToExt(mimeType);
      const path = `${folder}/${fileId}.${ext}`;

      if (Platform.OS === 'web') {
        // Web : on peut construire un Blob sans limite de taille notable
        const byteChars = atob(base64DataInline);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: mimeType });
        const { error } = await supabaseStorage.storage
          .from(STORAGE_BUCKET)
          .upload(path, blob, { contentType: mimeType, upsert: true });
        if (error) { console.error('Upload web data URI err:', error.message); return null; }
        return `${STORAGE_PUBLIC_URL}/${path}`;
      }

      // Mobile : data URI → fichier tmp → FileSystem.uploadAsync
      // (méthode dédiée upload qui contourne le bug fetch+Blob sur RN)
      // IMPORTANT : import explicite /legacy — l'API moderne (v18+) ne
      // donne plus cacheDirectory/documentDirectory au top-level.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileSystem = require('expo-file-system/legacy');
        const tmpDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!tmpDir) {
          console.error('Upload mobile data URI: no cache dir');
          return null;
        }
        const tmpPath = `${tmpDir}sig_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

        if (!base64DataInline) {
          console.error('Upload mobile data URI: no base64 data');
          return null;
        }

        await FileSystem.writeAsStringAsync(tmpPath, base64DataInline, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Upload via FileSystem.uploadAsync (dédié, contourne fetch+Blob)
        const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;
        const uploadResult = await FileSystem.uploadAsync(uploadUrl, tmpPath, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'x-upsert': 'true',
            'Content-Type': mimeType,
          },
        });

        // Cleanup
        try {
          await FileSystem.deleteAsync(tmpPath, { idempotent: true });
        } catch {}

        if (uploadResult.status < 200 || uploadResult.status >= 300) {
          console.error('Upload mobile data URI uploadAsync err:', uploadResult.status, uploadResult.body);
          return null;
        }
        return `${STORAGE_PUBLIC_URL}/${path}`;
      } catch (e) {
        console.error('Upload mobile data URI exception:', e);
        return null;
      }
    }

    // ── file:// ou content:// URI ──
    // Détecter l'extension depuis l'URI
    const uriLower = uri.toLowerCase().split('?')[0];
    let ext = uriLower.endsWith('.pdf') ? 'pdf'
      : uriLower.endsWith('.png') ? 'png'
      : uriLower.endsWith('.webp') ? 'webp'
      : uriLower.endsWith('.gif') ? 'gif'
      : (uriLower.endsWith('.jpg') || uriLower.endsWith('.jpeg')) ? 'jpg'
      : '';
    // URI sans extension fiable (cache DocumentPicker…) → on se fie au MIME fourni.
    if (!ext && mimeTypeHint) ext = mimeToExt(mimeTypeHint);
    if (!ext) ext = 'jpg';
    const contentType = ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/jpeg';

    const path = `${folder}/${fileId}.${ext}`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

    // Mobile : FileSystem.uploadAsync (fast path — pas de conversion Blob).
    // ~5-10x plus rapide que fetch(uri)→.blob()→fetch(upload) sur RN.
    if (Platform.OS !== 'web') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileSystem = require('expo-file-system/legacy');
        const uploadResult = await FileSystem.uploadAsync(uploadUrl, uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'x-upsert': 'true',
            'Content-Type': contentType,
          },
        });
        if (uploadResult.status < 200 || uploadResult.status >= 300) {
          console.error('Upload file:// uploadAsync err:', uploadResult.status, uploadResult.body);
          return null;
        }
        return `${STORAGE_PUBLIC_URL}/${path}`;
      } catch (e) {
        console.error('Upload file:// uploadAsync exception, fallback fetch+Blob:', e);
        // Fallback à la méthode fetch+Blob ci-dessous
      }
    }

    // Web (ou fallback si uploadAsync indisponible) : fetch + Blob
    const fileResponse = await fetch(uri);
    const fileBlob = await fileResponse.blob();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-upsert': 'true',
        'Content-Type': contentType,
      },
      body: fileBlob,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.error('Upload web fetch err:', uploadResponse.status, errText);
      return null;
    }

    return `${STORAGE_PUBLIC_URL}/${path}`;
  } catch (e) {
    console.error('Upload Storage err:', e);
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

import { createClient } from '@supabase/supabase-js';

// ─── Nouvelle base Supabase (v2) ─────────────────────────────────────────────
const SUPABASE_URL = 'https://wgbzslmwhyuoxqhishzk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnYnpzbG13aHl1b3hxaGlzaHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDQzODQsImV4cCI6MjA5MDEyMDM4NH0.qJ6JX5Ps58rbURffJR-kP7ZP9W5YEW7qQmMfykaZpKs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Initialise la table app_data si elle n'existe pas encore.
 * Appelé une seule fois au premier démarrage.
 */
export async function initSupabaseTables(): Promise<void> {
  // Vérifie si la ligne 'main' existe déjà
  const { data } = await supabase
    .from('app_data')
    .select('id')
    .eq('id', 'main')
    .maybeSingle();

  if (!data) {
    // Crée la ligne initiale vide
    await supabase
      .from('app_data')
      .insert({ id: 'main', data: {}, updated_at: new Date().toISOString() });
  }
}

/**
 * Charge les données depuis Supabase.
 * Timeout de 10s pour éviter le spinner infini sur connexion lente.
 */
export async function loadDataFromSupabase(): Promise<Record<string, unknown> | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));

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
      return (data?.data as Record<string, unknown>) ?? null;
    });

  const result = await Promise.race([query, timeout]);
  if (result === null) {
    console.warn('Supabase timeout ou données vides — démarrage local');
  }
  return result;
}

/**
 * Sauvegarde les données dans Supabase.
 * Appelé uniquement lors d'une vraie modification (pas en polling).
 */
export async function saveDataToSupabase(appData: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabase
    .from('app_data')
    .upsert({ id: 'main', data: appData, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Erreur sauvegarde Supabase:', error.message);
    return false;
  }
  return true;
}

/**
 * Crée un backup manuel horodaté.
 * À appeler uniquement sur action explicite de l'utilisateur.
 */
export async function createManualBackup(
  appData: Record<string, unknown>,
  label: string = 'manuel'
): Promise<boolean> {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');
  const id = `backup_${label}_${dateStr}`;

  const { error } = await supabase
    .from('app_data_backups')
    .insert({
      id,
      data: appData,
      saved_at: now.toISOString(),
    });

  if (error) {
    console.error('Erreur backup:', error.message);
    return false;
  }
  console.log(`✅ Backup créé : ${id}`);
  return true;
}

/**
 * Liste les 20 derniers backups disponibles.
 */
export async function listBackups(): Promise<{ id: string; saved_at: string }[]> {
  const { data, error } = await supabase
    .from('app_data_backups')
    .select('id, saved_at')
    .order('saved_at', { ascending: false })
    .limit(20);
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

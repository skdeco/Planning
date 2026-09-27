-- ═══════════════════════════════════════════════════════════════════════════
-- SK DECO — Menuiserie — étapes 2b / 2c / 2d : droits par rôle + nouvelles tables
-- À coller dans Supabase → SQL Editor → Run, APRÈS menuiserie_2a.sql et
-- menuiserie_2a_comptes.sql. Relançable sans risque.
--
-- Groupes de droits :
--   admin                      → tout
--   usine / employe_usine      → chantiers de SON usine, étapes usine ; jamais le client,
--                                 jamais les prix de vente ; l'employé ne voit AUCUN montant
--   client / architecte        → SES chantiers : documents partagés, règlements, messagerie, RDV
--   apporteur                  → SES chantiers : statut + sa commission
--   poseur                     → SES chantiers : plans, sa pose, son prix de pose
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Colonnes complémentaires ───────────────────────────────────────────────
alter table public.mn_usines   add column if not exists latitude double precision;
alter table public.mn_usines   add column if not exists longitude double precision;
alter table public.mn_usines   add column if not exists rayon_m integer not null default 200;
alter table public.mn_comptes  add column if not exists conges_annuels numeric(5,1) not null default 25;
alter table public.mn_documents add column if not exists categorie_client text;
alter table public.mn_montants add column if not exists compte_id uuid references public.mn_comptes(id) on delete cascade;

alter table public.mn_montants drop constraint if exists mn_montants_type_check;
alter table public.mn_montants add constraint mn_montants_type_check check (type in (
  'achat_usine','materiaux','emballage','transport','vente_client','pose','monte_charge','demenageur',
  'reserve','reglement_client','commission','reglement_commission','autre'));
alter table public.mn_montants drop constraint if exists mn_montants_visibilite_check;
alter table public.mn_montants add constraint mn_montants_visibilite_check check (visibilite in ('admin','usine','client','poseur','personnel'));

-- ── Fonctions de droits ────────────────────────────────────────────────────
create or replace function public.mn_mon_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.mn_comptes where user_id = auth.uid() and actif limit 1
$$;
create or replace function public.mn_mon_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.mn_comptes where user_id = auth.uid() and actif limit 1
$$;
create or replace function public.mn_mon_usine() returns uuid
language sql stable security definer set search_path = public as $$
  select usine_id from public.mn_comptes where user_id = auth.uid() and actif limit 1
$$;
-- Groupe de visibilité des documents
create or replace function public.mn_mon_groupe() returns text
language sql stable security definer set search_path = public as $$
  select case role when 'employe_usine' then 'usine' when 'architecte' then 'client' else role end
  from public.mn_comptes where user_id = auth.uid() and actif limit 1
$$;

create or replace function public.mn_peut_voir_chantier(p_chantier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mn_est_admin()
      or exists (select 1 from public.mn_chantiers c
                 where c.id = p_chantier and c.usine_id is not null
                   and public.mn_mon_role() in ('usine','employe_usine') and c.usine_id = public.mn_mon_usine())
      or exists (select 1 from public.mn_intervenants i
                 where i.chantier_id = p_chantier and i.compte_id is not null and i.compte_id = public.mn_mon_id())
$$;

-- Étapes visibles / modifiables selon le rôle
create or replace function public.mn_etape_visible(p_etape text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.mn_mon_groupe()
    when 'admin' then true
    when 'usine' then p_etape not in ('reception','pose','pv','sav')
    when 'poseur' then p_etape in ('plan_exe','montage','verification','livraison','pose')
    else false end
$$;
create or replace function public.mn_etape_modifiable(p_etape text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.mn_mon_groupe()
    when 'admin' then true
    when 'usine' then p_etape in ('devis','mesures','plan_exe','references','commande','production','montage','verification','emballage','livraison')
    when 'poseur' then p_etape in ('mesures','verification')
    when 'client' then p_etape in ('mesures')
    else false end
$$;

grant execute on function public.mn_mon_id(), public.mn_mon_role(), public.mn_mon_usine(), public.mn_mon_groupe(),
  public.mn_peut_voir_chantier(uuid), public.mn_etape_visible(text), public.mn_etape_modifiable(text) to authenticated;

-- ── Chantiers ──────────────────────────────────────────────────────────────
-- La table complète (avec le client) : admin + client / architecte / apporteur rattachés.
drop policy if exists "role_lecture" on public.mn_chantiers;
create policy "role_lecture" on public.mn_chantiers for select to authenticated using (
  public.mn_mon_groupe() in ('client','apporteur') and public.mn_peut_voir_chantier(id));

-- Vue sans aucune info client, pour l'usine, ses employés et le poseur
create or replace view public.mn_chantiers_vue as
  select id, nom, rue, code_postal, ville, code_acces, etage, cle, statut, usine_id, date_livraison_prevue, created_at, updated_at
  from public.mn_chantiers where public.mn_peut_voir_chantier(id);
grant select on public.mn_chantiers_vue to authenticated;

-- Usines : chacun lit la sienne
drop policy if exists "role_lecture" on public.mn_usines;
create policy "role_lecture" on public.mn_usines for select to authenticated using (id = public.mn_mon_usine());

-- Intervenants : chacun lit ses propres rattachements
drop policy if exists "role_lecture" on public.mn_intervenants;
create policy "role_lecture" on public.mn_intervenants for select to authenticated using (compte_id = public.mn_mon_id());

-- Comptes : l'usine gère les employés de son usine
drop policy if exists "usine_employes" on public.mn_comptes;
drop policy if exists "usine_lecture" on public.mn_comptes;
create policy "usine_lecture" on public.mn_comptes for select to authenticated
  using (public.mn_mon_role() = 'usine' and usine_id = public.mn_mon_usine());
create policy "usine_employes" on public.mn_comptes for all to authenticated
  using (public.mn_mon_role() = 'usine' and usine_id = public.mn_mon_usine() and role = 'employe_usine')
  with check (public.mn_mon_role() = 'usine' and usine_id = public.mn_mon_usine() and role = 'employe_usine');

-- ── Étapes ────────────────────────────────────────────────────────────────
drop policy if exists "role_lecture" on public.mn_etapes;
create policy "role_lecture" on public.mn_etapes for select to authenticated
  using (public.mn_peut_voir_chantier(chantier_id) and public.mn_etape_visible(etape));
drop policy if exists "role_ecriture" on public.mn_etapes;
create policy "role_ecriture" on public.mn_etapes for insert to authenticated
  with check (public.mn_peut_voir_chantier(chantier_id) and public.mn_etape_modifiable(etape));
drop policy if exists "role_maj" on public.mn_etapes;
create policy "role_maj" on public.mn_etapes for update to authenticated
  using (public.mn_peut_voir_chantier(chantier_id) and public.mn_etape_modifiable(etape))
  with check (public.mn_peut_voir_chantier(chantier_id) and public.mn_etape_modifiable(etape));

-- ── Documents ─────────────────────────────────────────────────────────────
drop policy if exists "role_lecture" on public.mn_documents;
create policy "role_lecture" on public.mn_documents for select to authenticated using (
  public.mn_peut_voir_chantier(chantier_id) and public.mn_mon_groupe() = any(visibilite) and not supprime);
drop policy if exists "role_depot" on public.mn_documents;
create policy "role_depot" on public.mn_documents for insert to authenticated with check (
  public.mn_peut_voir_chantier(chantier_id) and public.mn_etape_modifiable(etape)
  and depose_par = public.mn_mon_id() and public.mn_mon_groupe() = any(visibilite));
-- Suppression « douce » de ses propres dépôts (sauf prises de mesure : admin seul)
drop policy if exists "role_suppr" on public.mn_documents;
create policy "role_suppr" on public.mn_documents for update to authenticated
  using (depose_par = public.mn_mon_id() and etape <> 'mesures')
  with check (depose_par = public.mn_mon_id() and etape <> 'mesures');

-- ── Montants ──────────────────────────────────────────────────────────────
drop policy if exists "role_lecture" on public.mn_montants;
create policy "role_lecture" on public.mn_montants for select to authenticated using (
  public.mn_peut_voir_chantier(chantier_id) and (
       (public.mn_mon_role() = 'usine' and visibilite = 'usine' and usine_id = public.mn_mon_usine())
    or (public.mn_mon_groupe() = 'client' and visibilite = 'client')
    or (visibilite in ('poseur','personnel') and compte_id = public.mn_mon_id())
  ));
drop policy if exists "usine_ecriture" on public.mn_montants;
create policy "usine_ecriture" on public.mn_montants for all to authenticated
  using (public.mn_mon_role() = 'usine' and visibilite = 'usine' and usine_id = public.mn_mon_usine() and public.mn_peut_voir_chantier(chantier_id))
  with check (public.mn_mon_role() = 'usine' and visibilite = 'usine' and usine_id = public.mn_mon_usine()
              and type in ('achat_usine','materiaux','emballage','transport') and public.mn_peut_voir_chantier(chantier_id));

-- ── Journal : tout le monde peut écrire sur ses chantiers, seul l'admin lit ──
drop policy if exists "role_ecriture" on public.mn_journal;
create policy "role_ecriture" on public.mn_journal for insert to authenticated
  with check (par_compte = public.mn_mon_id() and (chantier_id is null or public.mn_peut_voir_chantier(chantier_id)));

-- ── Vérification des meubles ──────────────────────────────────────────────
create table if not exists public.mn_verifications (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  meuble text not null,
  criteres jsonb not null default '{}'::jsonb,   -- { cle: 'ok' | 'nok' | 'na' }
  commentaire text,
  updated_by_nom text,
  updated_at timestamptz not null default now(),
  unique (chantier_id, meuble)
);
alter table public.mn_verifications enable row level security;
drop policy if exists "admin_tout" on public.mn_verifications;
create policy "admin_tout" on public.mn_verifications for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin());
drop policy if exists "role_tout" on public.mn_verifications;
create policy "role_tout" on public.mn_verifications for all to authenticated
  using (public.mn_peut_voir_chantier(chantier_id) and public.mn_mon_groupe() in ('usine','poseur','client'))
  with check (public.mn_peut_voir_chantier(chantier_id) and public.mn_mon_groupe() in ('usine','poseur','client'));

-- ── Réserves (transmises à l'usine sans prix ni nom de client) ────────────
create table if not exists public.mn_reserves (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  meuble text,
  description text not null,
  statut text not null default 'a_reprendre' check (statut in ('a_reprendre','envoye','repris')),
  transmise_usine boolean not null default false,
  date_envoi_elements date,
  created_by_nom text,
  created_at timestamptz not null default now()
);
alter table public.mn_reserves enable row level security;
drop policy if exists "admin_tout" on public.mn_reserves;
create policy "admin_tout" on public.mn_reserves for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin());
drop policy if exists "usine_lecture" on public.mn_reserves;
create policy "usine_lecture" on public.mn_reserves for select to authenticated
  using (transmise_usine and public.mn_mon_groupe() in ('usine','poseur') and public.mn_peut_voir_chantier(chantier_id));
drop policy if exists "usine_maj" on public.mn_reserves;
create policy "usine_maj" on public.mn_reserves for update to authenticated
  using (transmise_usine and public.mn_mon_groupe() = 'usine' and public.mn_peut_voir_chantier(chantier_id))
  with check (transmise_usine and public.mn_mon_groupe() = 'usine' and public.mn_peut_voir_chantier(chantier_id));

-- ── Messagerie chantier (client / architecte / admins) ────────────────────
create table if not exists public.mn_messages (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  auteur_compte uuid references public.mn_comptes(id) on delete set null,
  auteur_nom text not null,
  texte text not null,
  created_at timestamptz not null default now()
);
alter table public.mn_messages enable row level security;
drop policy if exists "admin_tout" on public.mn_messages;
create policy "admin_tout" on public.mn_messages for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin());
drop policy if exists "client_lecture" on public.mn_messages;
create policy "client_lecture" on public.mn_messages for select to authenticated
  using (public.mn_mon_groupe() = 'client' and public.mn_peut_voir_chantier(chantier_id));
drop policy if exists "client_ecriture" on public.mn_messages;
create policy "client_ecriture" on public.mn_messages for insert to authenticated
  with check (public.mn_mon_groupe() = 'client' and auteur_compte = public.mn_mon_id() and public.mn_peut_voir_chantier(chantier_id));

-- ── RDV chantier : validation par tous les admins, puis par le client ──────
create table if not exists public.mn_rdv (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  titre text not null,
  date_rdv date not null,
  heure_debut text not null,
  heure_fin text,
  lieu text,
  statut text not null default 'validation_admins' check (statut in ('validation_admins','chez_client','confirme','refuse')),
  accords jsonb not null default '{}'::jsonb,   -- { compte_id: true | false }
  propose_par uuid references public.mn_comptes(id) on delete set null,
  propose_par_nom text,
  created_at timestamptz not null default now()
);
alter table public.mn_rdv enable row level security;
drop policy if exists "admin_tout" on public.mn_rdv;
create policy "admin_tout" on public.mn_rdv for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin());
drop policy if exists "client_lecture" on public.mn_rdv;
create policy "client_lecture" on public.mn_rdv for select to authenticated using (
  public.mn_mon_groupe() = 'client' and public.mn_peut_voir_chantier(chantier_id)
  and (statut in ('chez_client','confirme','refuse') or propose_par = public.mn_mon_id()));

-- Proposer un RDV (admin ou client)
create or replace function public.mn_rdv_proposer(p_chantier uuid, p_titre text, p_date date, p_debut text, p_fin text, p_lieu text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_moi uuid := public.mn_mon_id();
begin
  if v_moi is null or not public.mn_peut_voir_chantier(p_chantier) or public.mn_mon_groupe() not in ('admin','client') then
    raise exception 'Non autorisé';
  end if;
  insert into public.mn_rdv (chantier_id, titre, date_rdv, heure_debut, heure_fin, lieu, accords, propose_par, propose_par_nom)
  values (p_chantier, p_titre, p_date, p_debut, nullif(p_fin, ''), nullif(p_lieu, ''), jsonb_build_object(v_moi::text, true), v_moi,
          (select nom from public.mn_comptes where id = v_moi))
  returning id into v_id;
  perform public.mn_rdv_recalculer(v_id);
  return v_id;
end $$;

-- Répondre à un RDV (admin ou client concerné)
create or replace function public.mn_rdv_repondre(p_rdv uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_moi uuid := public.mn_mon_id(); v_ch uuid;
begin
  select chantier_id into v_ch from public.mn_rdv where id = p_rdv;
  if v_moi is null or not public.mn_peut_voir_chantier(v_ch) or public.mn_mon_groupe() not in ('admin','client') then
    raise exception 'Non autorisé';
  end if;
  update public.mn_rdv set accords = accords || jsonb_build_object(v_moi::text, p_ok) where id = p_rdv;
  perform public.mn_rdv_recalculer(p_rdv);
end $$;

-- Statut : tous les admins d'accord → chez le client ; clients d'accord → confirmé ; un refus → refusé
create or replace function public.mn_rdv_recalculer(p_rdv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.mn_rdv; v_admins_ok boolean; v_clients_ok boolean;
begin
  select * into r from public.mn_rdv where id = p_rdv;
  if exists (select 1 from jsonb_each(r.accords) where value = 'false'::jsonb) then
    update public.mn_rdv set statut = 'refuse' where id = p_rdv; return;
  end if;
  select bool_and(coalesce((r.accords ->> c.id::text)::boolean, false)) into v_admins_ok
  from public.mn_comptes c where c.role = 'admin' and c.actif;
  select coalesce(bool_and(coalesce((r.accords ->> i.compte_id::text)::boolean, false)), true) into v_clients_ok
  from public.mn_intervenants i join public.mn_comptes c on c.id = i.compte_id
  where i.chantier_id = r.chantier_id and i.role in ('client','architecte') and c.actif and c.role in ('client','architecte');
  update public.mn_rdv set statut = case
      when coalesce(v_admins_ok, false) and v_clients_ok then 'confirme'
      when coalesce(v_admins_ok, false) then 'chez_client'
      else 'validation_admins' end
  where id = p_rdv;
end $$;
grant execute on function public.mn_rdv_proposer(uuid, text, date, text, text, text), public.mn_rdv_repondre(uuid, boolean) to authenticated;
revoke execute on function public.mn_rdv_recalculer(uuid) from public, anon, authenticated;

-- ── Signalements du poseur (matériel, problème sur un meuble) ─────────────
create table if not exists public.mn_signalements (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  type text not null check (type in ('materiel','probleme')),
  meuble text,
  texte text not null,
  nouvelle_cote text,
  statut text not null default 'ouvert' check (statut in ('ouvert','traite')),
  par_compte uuid references public.mn_comptes(id) on delete set null,
  par_nom text,
  created_at timestamptz not null default now()
);
alter table public.mn_signalements enable row level security;
drop policy if exists "admin_tout" on public.mn_signalements;
create policy "admin_tout" on public.mn_signalements for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin());
drop policy if exists "auteur" on public.mn_signalements;
create policy "auteur" on public.mn_signalements for all to authenticated
  using (par_compte = public.mn_mon_id())
  with check (par_compte = public.mn_mon_id() and public.mn_peut_voir_chantier(chantier_id));

-- ── Ressources humaines : pointage, congés / absences, documents ──────────
create table if not exists public.mn_pointages (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.mn_comptes(id) on delete cascade,
  usine_id uuid references public.mn_usines(id) on delete set null,
  chantier_id uuid references public.mn_chantiers(id) on delete set null,
  type text not null check (type in ('arrivee','depart')),
  horodatage timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  distance_m integer,
  hors_zone boolean not null default false
);
create table if not exists public.mn_conges (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.mn_comptes(id) on delete cascade,
  usine_id uuid references public.mn_usines(id) on delete set null,
  type text not null default 'conges' check (type in ('conges','absence')),
  date_debut date not null,
  date_fin date not null,
  jours numeric(5,1) not null default 1,
  motif text,
  justificatif_chemin text,
  statut text not null default 'en_attente' check (statut in ('en_attente','approuve','refuse')),
  traite_par_nom text,
  created_at timestamptz not null default now()
);
create table if not exists public.mn_docs_rh (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.mn_comptes(id) on delete cascade,
  usine_id uuid references public.mn_usines(id) on delete set null,
  type text not null default 'fiche_paie' check (type in ('fiche_paie','autre')),
  mois text,
  nom text not null,
  chemin text not null,
  created_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['mn_pointages','mn_conges','mn_docs_rh'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_tout" on public.%I', t);
    execute format('create policy "admin_tout" on public.%I for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin())', t);
    execute format('drop policy if exists "soi_lecture" on public.%I', t);
    execute format('create policy "soi_lecture" on public.%I for select to authenticated using (compte_id = public.mn_mon_id())', t);
    execute format('drop policy if exists "usine_tout" on public.%I', t);
    execute format('create policy "usine_tout" on public.%I for all to authenticated using (public.mn_mon_role() = ''usine'' and usine_id = public.mn_mon_usine()) with check (public.mn_mon_role() = ''usine'' and usine_id = public.mn_mon_usine())', t);
  end loop;
end $$;
drop policy if exists "soi_pointer" on public.mn_pointages;
create policy "soi_pointer" on public.mn_pointages for insert to authenticated with check (compte_id = public.mn_mon_id());
drop policy if exists "soi_demander" on public.mn_conges;
create policy "soi_demander" on public.mn_conges for insert to authenticated with check (compte_id = public.mn_mon_id() and statut = 'en_attente');

-- ── Fournisseurs et catalogue matériaux ───────────────────────────────────
create table if not exists public.mn_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  usine_id uuid references public.mn_usines(id) on delete cascade,
  nom text not null,
  categorie text,
  contact text,
  telephone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.mn_catalogue (
  id uuid primary key default gen_random_uuid(),
  usine_id uuid references public.mn_usines(id) on delete cascade,
  categorie text not null check (categorie in ('panneaux','tissus','quincaillerie_dressing','quincaillerie_cuisine','eclairage','stock','autre')),
  marque text,
  reference text,
  reference_interne text,
  designation text not null,
  quantite text,
  photo_chemin text,
  notes text,
  created_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['mn_fournisseurs','mn_catalogue'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_tout" on public.%I', t);
    execute format('create policy "admin_tout" on public.%I for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin())', t);
    execute format('drop policy if exists "usine_lecture" on public.%I', t);
    execute format('create policy "usine_lecture" on public.%I for select to authenticated using (public.mn_mon_groupe() = ''usine'' and (usine_id is null or usine_id = public.mn_mon_usine()))', t);
    execute format('drop policy if exists "usine_ecriture" on public.%I', t);
    execute format('create policy "usine_ecriture" on public.%I for all to authenticated using (public.mn_mon_role() = ''usine'' and usine_id = public.mn_mon_usine()) with check (public.mn_mon_role() = ''usine'' and usine_id = public.mn_mon_usine())', t);
  end loop;
end $$;

-- ── Fichiers : chaque rôle ne lit que les fichiers des documents qu'il voit ──
drop policy if exists "mn_fichiers_lecture" on storage.objects;
create policy "mn_fichiers_lecture" on storage.objects for select to authenticated using (
  bucket_id = 'menuiserie' and (
       exists (select 1 from public.mn_documents d where d.chemin = storage.objects.name)
    or exists (select 1 from public.mn_docs_rh r where r.chemin = storage.objects.name)
    or exists (select 1 from public.mn_conges c where c.justificatif_chemin = storage.objects.name)
    or exists (select 1 from public.mn_catalogue k where k.photo_chemin = storage.objects.name)
  ));
drop policy if exists "mn_fichiers_depot" on storage.objects;
create policy "mn_fichiers_depot" on storage.objects for insert to authenticated with check (
  bucket_id = 'menuiserie' and public.mn_mon_id() is not null and (
       (split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' and public.mn_peut_voir_chantier(split_part(name, '/', 1)::uuid))
    or split_part(name, '/', 1) in ('rh', 'catalogue')
  ));

-- ── L'usine peut redonner un mot de passe à ses employés ──────────────────
create or replace function public.mn_admin_mot_de_passe(p_id uuid, p_mdp text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare c public.mn_comptes;
begin
  select * into c from public.mn_comptes where id = p_id;
  if not (public.mn_est_admin()
          or (public.mn_mon_role() = 'usine' and c.role = 'employe_usine' and c.usine_id = public.mn_mon_usine())) then
    raise exception 'Non autorisé';
  end if;
  if length(coalesce(p_mdp, '')) < 8 then raise exception 'Mot de passe : 8 caractères minimum'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_mdp, extensions.gen_salt('bf')), updated_at = now()
  where id = c.user_id;
end $$;

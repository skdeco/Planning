-- ═══════════════════════════════════════════════════════════════════════════
-- SK DECO — Espace Menuiserie — étape 2a : base sécurisée
-- À coller UNE FOIS dans Supabase → SQL Editor → Run.
-- Peut être relancé sans risque (idempotent).
--
-- Principe : chaque table a la sécurité par ligne (RLS) activée. À l'étape 2a,
-- seuls les comptes Menuiserie « admin » lisent / écrivent. Les droits usine,
-- client, architecte, poseur seront ouverts aux étapes suivantes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Comptes Menuiserie (liés à la connexion sécurisée Supabase Auth) ────────
create table if not exists public.mn_usines (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  contact_nom text,
  contact_tel text,
  contact_email text,
  adresse text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.mn_comptes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nom text not null,
  role text not null check (role in ('admin','usine','employe_usine','client','architecte','apporteur','poseur')),
  usine_id uuid references public.mn_usines(id) on delete set null,
  identifiant text unique,
  email text,
  telephone text,
  auth_email text,            -- e-mail utilisé pour la connexion (réel ou technique)
  app_ref text,               -- lien vers le compte de l'app Travaux (ex. 'app:<id>', id employé, 'admin')
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Chantiers ──────────────────────────────────────────────────────────────
create table if not exists public.mn_chantiers (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  rue text,
  code_postal text,
  ville text,
  code_acces text,
  etage text,
  cle text,
  statut text not null default 'en_cours' check (statut in ('en_cours','cloture','sav')),
  usine_id uuid references public.mn_usines(id) on delete set null,
  date_livraison_prevue date,
  -- Client (fiche d'identité ; son éventuel compte est dans mn_intervenants)
  client_nom text,
  client_societe text,
  client_rue text,
  client_code_postal text,
  client_ville text,
  client_tel text,
  client_email text,
  created_by uuid references public.mn_comptes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Qui est rattaché au chantier, avec quel rôle (sert aux filtres et, plus tard, aux droits)
create table if not exists public.mn_intervenants (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  role text not null check (role in ('client','architecte','apporteur','responsable','poseur')),
  nom text not null,
  compte_id uuid references public.mn_comptes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mn_intervenants_chantier on public.mn_intervenants(chantier_id);

-- Avancement de chaque étape (statut + infos libres propres à l'étape)
create table if not exists public.mn_etapes (
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  etape text not null,
  statut text not null default 'a_faire' check (statut in ('a_faire','en_cours','fait')),
  infos jsonb not null default '{}'::jsonb,
  updated_by_nom text,
  updated_at timestamptz not null default now(),
  primary key (chantier_id, etape)
);

-- Documents et photos (fichiers dans le bucket privé « menuiserie »)
create table if not exists public.mn_documents (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  etape text not null,
  piece text,                 -- nom de pièce (prises de mesure)
  nom text not null,
  chemin text not null,       -- chemin dans le bucket
  mime text,
  visibilite text[] not null default array['admin'],
  depose_par uuid references public.mn_comptes(id) on delete set null,
  depose_par_nom text,
  supprime boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mn_documents_chantier on public.mn_documents(chantier_id, etape);

-- Montants : chaque ligne dit qui a le droit de la voir
create table if not exists public.mn_montants (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.mn_chantiers(id) on delete cascade,
  etape text,
  type text not null check (type in ('achat_usine','materiaux','emballage','transport','vente_client','pose','monte_charge','demenageur','reserve','autre')),
  libelle text,
  montant_ht numeric(12,2) not null,
  visibilite text not null default 'admin' check (visibilite in ('admin','usine','client')),
  usine_id uuid references public.mn_usines(id) on delete set null,
  date_montant date,
  created_by_nom text,
  created_at timestamptz not null default now()
);
create index if not exists mn_montants_chantier on public.mn_montants(chantier_id);

-- Historique « modifié par »
create table if not exists public.mn_journal (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid references public.mn_chantiers(id) on delete cascade,
  action text not null,
  detail text,
  par_nom text,
  par_compte uuid references public.mn_comptes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mn_journal_chantier on public.mn_journal(chantier_id, created_at desc);

-- ── Fonctions d'aide (exécutées avec les droits du propriétaire) ─────────────
create or replace function public.mn_mon_compte() returns public.mn_comptes
language sql stable security definer set search_path = public as $$
  select * from public.mn_comptes where user_id = auth.uid() and actif limit 1
$$;

create or replace function public.mn_est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mn_comptes where user_id = auth.uid() and actif and role = 'admin')
$$;

-- Connexion par identifiant : renvoie l'e-mail de connexion associé
create or replace function public.mn_email_connexion(p_identifiant text) returns text
language sql stable security definer set search_path = public as $$
  select auth_email from public.mn_comptes
  where lower(identifiant) = lower(trim(p_identifiant)) and actif limit 1
$$;

-- Premier administrateur : possible uniquement tant qu'aucun admin n'existe
create or replace function public.mn_creer_premier_admin(p_nom text, p_identifiant text, p_app_ref text)
returns public.mn_comptes
language plpgsql security definer set search_path = public as $$
declare r public.mn_comptes;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if exists (select 1 from public.mn_comptes where role = 'admin') then
    raise exception 'Un administrateur existe déjà';
  end if;
  insert into public.mn_comptes (user_id, nom, role, identifiant, auth_email, email, app_ref)
  values (auth.uid(), p_nom, 'admin', nullif(lower(trim(p_identifiant)), ''),
          (select email from auth.users where id = auth.uid()),
          (select email from auth.users where id = auth.uid()), p_app_ref)
  returning * into r;
  return r;
end $$;

create or replace function public.mn_existe_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mn_comptes where role = 'admin')
$$;

grant execute on function public.mn_email_connexion(text) to anon, authenticated;
grant execute on function public.mn_existe_admin() to anon, authenticated;
grant execute on function public.mn_mon_compte() to authenticated;
grant execute on function public.mn_est_admin() to authenticated;
grant execute on function public.mn_creer_premier_admin(text, text, text) to authenticated;

-- ── Sécurité par ligne ─────────────────────────────────────────────────────
alter table public.mn_usines       enable row level security;
alter table public.mn_comptes      enable row level security;
alter table public.mn_chantiers    enable row level security;
alter table public.mn_intervenants enable row level security;
alter table public.mn_etapes       enable row level security;
alter table public.mn_documents    enable row level security;
alter table public.mn_montants     enable row level security;
alter table public.mn_journal      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['mn_usines','mn_comptes','mn_chantiers','mn_intervenants','mn_etapes','mn_documents','mn_montants','mn_journal']
  loop
    execute format('drop policy if exists "admin_tout" on public.%I', t);
    execute format('create policy "admin_tout" on public.%I for all to authenticated using (public.mn_est_admin()) with check (public.mn_est_admin())', t);
  end loop;
end $$;

-- Chacun peut lire sa propre fiche compte
drop policy if exists "moi_lecture" on public.mn_comptes;
create policy "moi_lecture" on public.mn_comptes for select to authenticated using (user_id = auth.uid());

-- ── Fichiers : bucket privé « menuiserie » ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('menuiserie', 'menuiserie', false)
on conflict (id) do update set public = false;

drop policy if exists "mn_fichiers_admin" on storage.objects;
create policy "mn_fichiers_admin" on storage.objects for all to authenticated
  using (bucket_id = 'menuiserie' and public.mn_est_admin())
  with check (bucket_id = 'menuiserie' and public.mn_est_admin());

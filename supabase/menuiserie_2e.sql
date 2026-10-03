-- ════════════════════════════════════════════════════════════════════════════
-- Menuiserie 2e — droits réglables des employés d'usine + plans pour devis
--  1. mn_comptes.droits : ce qu'un employé / responsable d'usine peut voir
--     (montants de l'usine, étapes visibles). Les associés (rôle « usine »)
--     voient tout ce qui concerne leur usine.
--  2. « Plan pour devis » : déposable par l'admin, l'usine et l'apporteur /
--     commercial rattaché au chantier.
--  3. Le prix de vente client reste réservé aux administrateurs (inchangé :
--     visibilité 'admin').
-- À exécuter une fois dans Supabase → SQL Editor. Ré-exécutable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.mn_comptes add column if not exists droits jsonb not null default '{}'::jsonb;

create or replace function public.mn_mes_droits() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(droits, '{}'::jsonb) from public.mn_comptes where user_id = auth.uid() and actif limit 1
$$;
grant execute on function public.mn_mes_droits() to authenticated;

-- Étape ouverte à l'employé d'usine ? (absence de liste = toutes les étapes usine)
create or replace function public.mn_etape_ouverte_employe(p_etape text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mn_mon_role() <> 'employe_usine'
      or not (public.mn_mes_droits() ? 'etapes')
      or (public.mn_mes_droits() -> 'etapes') ? p_etape
$$;
grant execute on function public.mn_etape_ouverte_employe(text) to authenticated;

create or replace function public.mn_etape_visible(p_etape text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.mn_mon_groupe()
    when 'admin' then true
    when 'usine' then p_etape not in ('reception','pose','pv','sav') and public.mn_etape_ouverte_employe(p_etape)
    when 'poseur' then p_etape in ('plan_exe','montage','verification','livraison','pose')
    when 'apporteur' then p_etape = 'plan_devis'
    else false end
$$;

create or replace function public.mn_etape_modifiable(p_etape text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.mn_mon_groupe()
    when 'admin' then true
    when 'usine' then p_etape in ('plan_devis','devis','mesures','plan_exe','references','commande','production','montage','verification','emballage','livraison')
                      and public.mn_etape_ouverte_employe(p_etape)
    when 'poseur' then p_etape in ('mesures','verification')
    when 'client' then p_etape in ('mesures')
    when 'apporteur' then p_etape = 'plan_devis'
    else false end
$$;

-- Montants : l'employé d'usine voit ceux de l'usine seulement si l'admin le lui ouvre
drop policy if exists "role_lecture" on public.mn_montants;
create policy "role_lecture" on public.mn_montants for select to authenticated using (
  public.mn_peut_voir_chantier(chantier_id) and (
       (public.mn_mon_role() = 'usine' and visibilite = 'usine' and usine_id = public.mn_mon_usine())
    or (public.mn_mon_role() = 'employe_usine' and visibilite = 'usine' and usine_id = public.mn_mon_usine()
        and coalesce((public.mn_mes_droits() ->> 'voir_montants_usine')::boolean, false))
    or (public.mn_mon_groupe() = 'client' and visibilite = 'client')
    or (visibilite in ('poseur','personnel') and compte_id = public.mn_mon_id())
  ));

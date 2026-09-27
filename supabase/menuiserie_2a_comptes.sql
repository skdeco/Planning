-- ═══════════════════════════════════════════════════════════════════════════
-- SK DECO — Menuiserie — étape 2a (complément) : modifier / supprimer un compte
-- À coller dans Supabase → SQL Editor → Run (après menuiserie_2a.sql).
-- Réservé aux administrateurs Menuiserie. Relançable sans risque.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto with schema extensions;

-- Modifier un compte : nom, rôle, usine, identifiant, e-mail de connexion, téléphone
create or replace function public.mn_admin_modifier_compte(
  p_id uuid, p_nom text, p_role text, p_usine_id uuid,
  p_identifiant text, p_email text, p_telephone text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid;
  v_ident text := nullif(lower(trim(coalesce(p_identifiant, ''))), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_auth text;
begin
  if not public.mn_est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  select user_id into v_user from public.mn_comptes where id = p_id;
  if not found then raise exception 'Compte introuvable'; end if;
  if v_ident is null and v_email is null then raise exception 'Indique un e-mail ou un identifiant'; end if;
  if v_user = auth.uid() and p_role <> 'admin' then raise exception 'Tu ne peux pas retirer ton propre rôle administrateur'; end if;
  v_auth := coalesce(v_email, regexp_replace(v_ident, '[^a-z0-9._-]', '', 'g') || '@comptes.skdeco.fr');

  if v_user is not null and exists (select 1 from auth.users where lower(email) = v_auth and id <> v_user) then
    raise exception 'Cet e-mail / identifiant est déjà utilisé par un autre compte';
  end if;

  update public.mn_comptes set
    nom = trim(p_nom), role = p_role, usine_id = p_usine_id, identifiant = v_ident,
    email = v_email, telephone = nullif(trim(coalesce(p_telephone, '')), ''), auth_email = v_auth
  where id = p_id;

  if v_user is not null then
    update auth.users set email = v_auth, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
    where id = v_user;
    update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_auth), updated_at = now()
    where user_id = v_user and provider = 'email';
  end if;
end $$;

-- Donner un nouveau mot de passe (utile pour les comptes sans e-mail)
create or replace function public.mn_admin_mot_de_passe(p_id uuid, p_mdp text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.mn_est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if length(coalesce(p_mdp, '')) < 8 then raise exception 'Mot de passe : 8 caractères minimum'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_mdp, extensions.gen_salt('bf')), updated_at = now()
  where id = (select user_id from public.mn_comptes where id = p_id);
end $$;

-- Supprimer définitivement un compte (connexion comprise)
create or replace function public.mn_admin_supprimer_compte(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.mn_est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  select user_id into v_user from public.mn_comptes where id = p_id;
  if v_user = auth.uid() then raise exception 'Tu ne peux pas supprimer ton propre compte'; end if;
  delete from public.mn_comptes where id = p_id;
  if v_user is not null then delete from auth.users where id = v_user; end if;
end $$;

grant execute on function public.mn_admin_modifier_compte(uuid, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.mn_admin_mot_de_passe(uuid, text) to authenticated;
grant execute on function public.mn_admin_supprimer_compte(uuid) to authenticated;

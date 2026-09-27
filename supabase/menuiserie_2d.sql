-- SK DECO — Menuiserie : chacun peut changer SON identifiant / e-mail de connexion.
-- (Le mot de passe, lui, se change directement par la connexion sécurisée.)
-- À coller dans Supabase → SQL Editor → Run. Relançable sans risque.
create or replace function public.mn_mes_identifiants(p_identifiant text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ident text := nullif(lower(trim(coalesce(p_identifiant, ''))), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_auth text;
begin
  if auth.uid() is null or public.mn_mon_id() is null then raise exception 'Non connecté'; end if;
  if v_ident is null and v_email is null then raise exception 'Indique un e-mail ou un identifiant'; end if;
  v_auth := coalesce(v_email, regexp_replace(v_ident, '[^a-z0-9._-]', '', 'g') || '@comptes.skdeco.fr');
  if exists (select 1 from auth.users where lower(email) = v_auth and id <> auth.uid()) then
    raise exception 'Cet e-mail / identifiant est déjà utilisé par un autre compte';
  end if;
  if v_ident is not null and exists (select 1 from public.mn_comptes where lower(identifiant) = v_ident and user_id <> auth.uid()) then
    raise exception 'Cet identifiant est déjà utilisé';
  end if;
  update public.mn_comptes set identifiant = v_ident, email = v_email, auth_email = v_auth where user_id = auth.uid();
  update auth.users set email = v_auth, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = auth.uid();
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_auth), updated_at = now()
  where user_id = auth.uid() and provider = 'email';
end $$;
grant execute on function public.mn_mes_identifiants(text, text) to authenticated;

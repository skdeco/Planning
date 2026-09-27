-- SK DECO — Menuiserie : statut « Archivé » pour les chantiers.
-- À coller dans Supabase → SQL Editor → Run. Relançable sans risque.
alter table public.mn_chantiers drop constraint if exists mn_chantiers_statut_check;
alter table public.mn_chantiers add constraint mn_chantiers_statut_check
  check (statut in ('en_cours','cloture','sav','archive'));

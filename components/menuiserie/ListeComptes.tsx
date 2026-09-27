/**
 * Liste des comptes Menuiserie, triée par filtre :
 * Tous · Usines · Architectes · Clients · Apporteurs (· Poseurs s'il y en a).
 * Les usines s'affichent en hiérarchie : le compte usine, puis ses employés en retrait.
 */
import React from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { DS, radius } from '@/constants/design';
import type { CompteMn, RoleCompteMn, UsineMn } from '@/lib/menuiserie/types';
import { ROLE_COMPTE_MN_LABELS } from '@/lib/menuiserie/types';
import { Carte, Puce, Section } from './ui';
import { tm } from '@/lib/menuiserie/i18n';

export type FiltreComptes = 'tous' | 'usines' | 'architectes' | 'clients' | 'apporteurs' | 'poseurs';

/** Rôle pré-rempli quand on crée un compte depuis un filtre. */
export const ROLE_DU_FILTRE: Record<FiltreComptes, RoleCompteMn> = {
  tous: 'client', usines: 'usine', architectes: 'architecte', clients: 'client', apporteurs: 'apporteur', poseurs: 'poseur',
};
const ROLE_FILTRE: Partial<Record<FiltreComptes, RoleCompteMn>> = {
  architectes: 'architecte', clients: 'client', apporteurs: 'apporteur', poseurs: 'poseur',
};
const LIBELLE_FILTRE: Record<FiltreComptes, string> = {
  tous: 'Tous', usines: 'Usines', architectes: 'Architectes', clients: 'Clients', apporteurs: 'Apporteurs', poseurs: 'Poseurs',
};

interface Props {
  comptes: CompteMn[];
  usines: UsineMn[];
  moiId: string;
  filtre: FiltreComptes;
  onFiltre: (f: FiltreComptes) => void;
  /** Noms des chantiers rattachés à un compte (clients, architectes…) */
  chantiersDe: (compteId: string) => string[];
  onModifier: (c: CompteMn) => void;
  onActiver: (c: CompteMn, actif: boolean) => void;
  onNouvelEmploye: (usineId: string) => void;
  onNouvelleUsineCompte: (usineId: string) => void;
}

export function ListeComptes(p: Props) {
  const { comptes, usines, filtre } = p;
  const deRole = (r: RoleCompteMn) => comptes.filter(c => c.role === r).sort((a, b) => a.nom.localeCompare(b.nom));
  const nb: Record<FiltreComptes, number> = {
    tous: comptes.length, usines: usines.length, architectes: deRole('architecte').length,
    clients: deRole('client').length, apporteurs: deRole('apporteur').length, poseurs: deRole('poseur').length,
  };
  const filtres: FiltreComptes[] = ['tous', 'usines', 'architectes', 'clients', 'apporteurs'];
  if (nb.poseurs > 0) filtres.push('poseurs');

  const ligne = (c: CompteMn, sousTitre: string, enfant?: boolean) => (
    <Pressable key={c.id} onPress={() => p.onModifier(c)} accessibilityRole="button" accessibilityLabel={tm("Modifier le compte de {0}", c.nom)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6,
        ...(enfant ? { marginLeft: 14, paddingLeft: 10, paddingRight: 8, backgroundColor: DS.background, borderRadius: radius.sm } : {}) }}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: enfant ? 15 : 16, fontWeight: '800', color: c.actif ? DS.text : DS.textSecondary }}>
          {enfant ? '└ ' : ''}{c.nom}{c.id === p.moiId ? tm(" (moi)") : ''}
        </Text>
        <Text style={{ fontSize: 12.5, color: DS.textSecondary }} numberOfLines={2}>{sousTitre}</Text>
        {!c.actif && <Text style={{ fontSize: 12, fontWeight: '700', color: DS.error }}>{tm("Désactivé")}</Text>}
      </View>
      <Switch value={c.actif} disabled={c.id === p.moiId} onValueChange={v => p.onActiver(c, v)}
        trackColor={{ false: DS.border, true: DS.primary }} thumbColor={DS.surface} accessibilityLabel={tm("Compte {0} actif", c.nom)} />
    </Pressable>
  );
  const connexion = (c: CompteMn) => c.email || c.identifiant || '';
  const simple = (c: CompteMn) => {
    const ch = p.chantiersDe(c.id);
    return ligne(c, [ROLE_COMPTE_MN_LABELS[c.role], connexion(c), ch.length ? ch.join(', ') : ''].filter(Boolean).join(' · '));
  };

  const blocUsines = () => {
    const idsUsines = new Set(usines.map(u => u.id));
    const orphelins = comptes.filter(c => (c.role === 'usine' || c.role === 'employe_usine') && (!c.usine_id || !idsUsines.has(c.usine_id)));
    return (
      <>
        {usines.map(u => {
          const cptUsine = comptes.filter(c => c.role === 'usine' && c.usine_id === u.id);
          const employes = comptes.filter(c => c.role === 'employe_usine' && c.usine_id === u.id).sort((a, b) => a.nom.localeCompare(b.nom));
          return (
            <Carte key={u.id} style={{ gap: 4 }}>
              {cptUsine.length ? cptUsine.map(c => ligne(c, [tm("Usine"), connexion(c)].filter(Boolean).join(' · '))) : (
                <Pressable onPress={() => p.onNouvelleUsineCompte(u.id)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{u.nom}</Text>
                  <Text style={{ fontSize: 12.5, color: DS.primary, fontWeight: '700' }}>{tm("Pas de compte usine · créer")}</Text>
                </Pressable>
              )}
              {employes.map(c => ligne(c, [tm("Employé d'usine"), connexion(c)].filter(Boolean).join(' · '), true))}
              {!employes.length && <Text style={{ marginLeft: 14, fontSize: 12.5, color: DS.textSecondary }}>{tm("(aucun employé)")}</Text>}
              <Pressable onPress={() => p.onNouvelEmploye(u.id)} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center', marginLeft: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: DS.primary }}>{tm("+ Employé")}</Text>
              </Pressable>
            </Carte>
          );
        })}
        {orphelins.length > 0 && <Carte style={{ gap: 4 }}><Text style={{ fontSize: 13, fontWeight: '800', color: DS.textSecondary }}>{tm("Sans usine")}</Text>{orphelins.map(simple)}</Carte>}
      </>
    );
  };
  const blocRole = (r: RoleCompteMn) => {
    const l = deRole(r);
    return l.length ? <Carte style={{ gap: 2 }}>{l.map(simple)}</Carte> : <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Aucun compte.")}</Text>;
  };

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {filtres.map(f => <Puce key={f} label={`${tm(LIBELLE_FILTRE[f])} (${nb[f]})`} actif={filtre === f} onPress={() => p.onFiltre(f)} />)}
      </View>
      {filtre === 'usines' && blocUsines()}
      {ROLE_FILTRE[filtre] && blocRole(ROLE_FILTRE[filtre]!)}
      {filtre === 'tous' && (
        <>
          {deRole('admin').length > 0 && <><Section>{tm("Administration")}</Section>{blocRole('admin')}</>}
          <Section>{tm("Usines")}</Section>{blocUsines()}
          {(['architecte', 'client', 'apporteur', 'poseur'] as RoleCompteMn[]).filter(r => deRole(r).length).map(r => (
            <React.Fragment key={r}><Section>{tm(LIBELLE_FILTRE[({ architecte: 'architectes', client: 'clients', apporteur: 'apporteurs', poseur: 'poseurs' } as Record<string, FiltreComptes>)[r]])}</Section>{blocRole(r)}</React.Fragment>
          ))}
        </>
      )}
    </>
  );
}

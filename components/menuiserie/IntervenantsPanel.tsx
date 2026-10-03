/**
 * Intervenants d'un chantier (admin) : client, architecte, apporteur, responsable, poseur.
 * Lier un intervenant à un compte Menuiserie lui ouvre l'accès à CE chantier.
 * « Donner accès » : choisir un compte existant OU en créer un sur place.
 * L'ajout s'affiche tout de suite (sans attendre le rechargement).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { DS, radius } from '@/constants/design';
import { listerComptesMn } from '@/lib/menuiserie/api';
import { creerCompteMn } from '@/lib/menuiserie/auth';
import { lireCacheMn, ecrireCacheMn } from '@/lib/menuiserie/cache';
import { ajouterIntervenantMn, lierCompteIntervenantMn, retirerIntervenantMn } from '@/lib/menuiserie/api2';
import type { CompteMn, IntervenantMn, RoleCompteMn, RoleIntervenantMn } from '@/lib/menuiserie/types';
import { ROLE_INTERVENANT_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Champ, Pastille, Puce } from './ui';

import { tm } from '@/lib/menuiserie/i18n';
const ROLES: RoleIntervenantMn[] = ['client', 'architecte', 'apporteur', 'responsable', 'poseur'];
const COMPTE_POUR: Record<RoleIntervenantMn, RoleCompteMn> = {
  client: 'client', architecte: 'architecte', apporteur: 'apporteur', responsable: 'admin', poseur: 'poseur',
};

/** Mot de passe lisible proposé à la création (modifiable). */
function motDePasseSuggere(): string {
  const mots = ['Bois', 'Chene', 'Noyer', 'Laque', 'Atelier', 'Meuble'];
  return `${mots[Math.floor(Math.random() * mots.length)]}${Math.floor(1000 + Math.random() * 9000)}!`;
}

export function IntervenantsPanel({ moi, chantierId, intervenants, onChange }: {
  moi: CompteMn; chantierId: string; intervenants: IntervenantMn[]; onChange: () => void;
}) {
  const [comptes, setComptes] = useState<CompteMn[]>(() => lireCacheMn<CompteMn[]>('comptes') || []);
  const [role, setRole] = useState<RoleIntervenantMn>('poseur');
  const [nom, setNom] = useState('');
  const [enAttente, setEnAttente] = useState<{ id: string; role: RoleIntervenantMn; nom: string }[]>([]);
  const [aLier, setALier] = useState<IntervenantMn | null>(null);
  const [creation, setCreation] = useState<{ nom: string; email: string; identifiant: string; motDePasse: string } | null>(null);
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const rechargerComptes = () => listerComptesMn().then(c => { ecrireCacheMn('comptes', c); setComptes(c); return c; });
  useEffect(() => { rechargerComptes().catch(() => {}); }, []);
  // Les ajouts « en attente » disparaissent dès que la liste rechargée les contient
  useEffect(() => { setEnAttente(p => p.filter(x => !intervenants.some(i => i.nom === x.nom && i.role === x.role))); }, [intervenants]);

  const agir = async (f: () => Promise<void>) => { try { setErreur(''); await f(); onChange(); } catch (e) { setErreur((e as Error).message); } };
  const candidats = aLier ? comptes.filter(c => c.actif && c.role === COMPTE_POUR[aLier.role]) : [];

  const ajouter = () => {
    const n = nom.trim();
    if (!n) return;
    const tmp = { id: `tmp_${Date.now()}`, role, nom: n };
    setEnAttente(p => [...p, tmp]);
    setNom('');
    ajouterIntervenantMn(moi, chantierId, role, n, null)
      .then(onChange)
      .catch(e => { setEnAttente(p => p.filter(x => x.id !== tmp.id)); setErreur((e as Error).message); });
  };

  const ouvrirAcces = (i: IntervenantMn) => { setALier(i); setCreation(null); setMessage(''); };
  const fermerAcces = () => { setALier(null); setCreation(null); };

  const creerEtLier = async () => {
    if (!aLier || !creation) return;
    setCharge(true); setMessage('');
    try {
      const r = await creerCompteMn({ nom: creation.nom, role: COMPTE_POUR[aLier.role], motDePasse: creation.motDePasse, email: creation.email, identifiant: creation.identifiant });
      if (!r.ok) { setMessage(r.erreur); return; }
      const liste = await rechargerComptes();
      const cle = (creation.email || creation.identifiant).trim().toLowerCase();
      const nouveau = liste.find(c => (c.email || '').toLowerCase() === cle || (c.identifiant || '').toLowerCase() === cle);
      if (nouveau) await lierCompteIntervenantMn(moi, aLier, nouveau.id);
      setMessage(tm("Compte créé. Communique à {0} : {1} / {2}", creation.nom, creation.email.trim() || creation.identifiant.trim(), creation.motDePasse));
      setCreation(null);
      onChange();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setCharge(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {intervenants.map(i => {
        const compte = comptes.find(c => c.id === i.compte_id);
        return (
          <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: DS.text }}>{ROLE_INTERVENANT_MN_LABELS[i.role]} · {i.nom}</Text>
              {compte ? <Pastille label={tm("Accès : {0}", compte.email || compte.identifiant)} fond="#E7F0EA" texte="#1F4D36" />
                : <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Pas d'accès à l'app")}</Text>}
            </View>
            <Pressable onPress={() => ouvrirAcces(i)} accessibilityRole="button" style={{ padding: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: DS.primary }}>{compte ? tm("Changer") : tm("Donner accès")}</Text>
            </Pressable>
            <Pressable onPress={() => agir(() => retirerIntervenantMn(moi, i))} accessibilityRole="button" accessibilityLabel={tm("Retirer {0}", i.nom)} style={{ padding: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: DS.error }}>{tm("Retirer")}</Text>
            </Pressable>
          </View>
        );
      })}
      {enAttente.map(i => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.background, borderRadius: radius.sm, padding: 10, opacity: 0.6 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: DS.text }}>{ROLE_INTERVENANT_MN_LABELS[i.role]} · {i.nom}</Text>
          <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("Ajout…")}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ROLES.map(r => <Puce key={r} label={ROLE_INTERVENANT_MN_LABELS[r]} actif={role === r} onPress={() => setRole(r)} />)}
      </View>
      <Champ label={tm("Nom ({0})", ROLE_INTERVENANT_MN_LABELS[role])} value={nom} onChangeText={setNom} onSubmitEditing={ajouter} returnKeyType="done" />
      <Bouton label={tm("Ajouter l'intervenant")} variante="contour" onPress={ajouter} />
      {!!erreur && <Text style={{ color: DS.error, fontWeight: '600', fontSize: 13 }}>{erreur}</Text>}
      {!!message && !aLier && <Text style={{ color: DS.text, fontWeight: '600', fontSize: 13 }}>{message}</Text>}

      <Modal visible={!!aLier} transparent animationType="fade" onRequestClose={fermerAcces}>
        <Pressable onPress={fermerAcces} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: DS.surface, borderRadius: radius.xxl, padding: 16, gap: 8, maxHeight: '85%' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text }}>{tm("Accès pour")}{' '}{aLier?.nom}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {!creation ? (
                <>
                  {candidats.length > 0 && <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Choisis son compte s'il existe déjà :")}</Text>}
                  {candidats.map(c => (
                    <Pressable key={c.id} style={{ padding: 12, borderRadius: radius.sm, backgroundColor: DS.background }} accessibilityRole="button"
                      onPress={() => { const it = aLier; fermerAcces(); if (it) agir(() => lierCompteIntervenantMn(moi, it, c.id)); }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{c.nom}</Text>
                      <Text style={{ fontSize: 12, color: DS.textSecondary }}>{c.email || c.identifiant}</Text>
                    </Pressable>
                  ))}
                  <Bouton label={tm("Créer un compte {0}", aLier ? ROLE_INTERVENANT_MN_LABELS[aLier.role].toLowerCase() : '')}
                    onPress={() => aLier && setCreation({ nom: aLier.nom, email: '', identifiant: '', motDePasse: motDePasseSuggere() })} />
                </>
              ) : (
                <>
                  <Champ label={tm("Nom")} value={creation.nom} onChangeText={v => setCreation(p => (p ? { ...p, nom: v } : p))} />
                  <Champ label={tm("E-mail")} value={creation.email} keyboardType="email-address" autoCapitalize="none" onChangeText={v => setCreation(p => (p ? { ...p, email: v } : p))} />
                  <Champ label={tm("ou identifiant (sans e-mail)")} value={creation.identifiant} autoCapitalize="none" onChangeText={v => setCreation(p => (p ? { ...p, identifiant: v } : p))} />
                  <Champ label={tm("Mot de passe (8 caractères min.)")} value={creation.motDePasse} autoCapitalize="none" onChangeText={v => setCreation(p => (p ? { ...p, motDePasse: v } : p))} />
                  <Bouton label={tm("Créer et donner l'accès")} onPress={creerEtLier} charge={charge} />
                  <Bouton label={tm("Annuler")} variante="discret" onPress={() => setCreation(null)} />
                </>
              )}
              {!!message && <Text style={{ fontSize: 13, color: DS.text, fontWeight: '600' }}>{message}</Text>}
              {!!aLier?.compte_id && !creation && <Bouton label={tm("Retirer l'accès")} variante="discret" onPress={() => { const it = aLier; fermerAcces(); agir(() => lierCompteIntervenantMn(moi, it, null)); }} />}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

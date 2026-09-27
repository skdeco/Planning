/**
 * Comptes de l'espace Menuiserie (administrateur) : création, modification
 * (nom, rôle, usine, e-mail / identifiant de connexion), nouveau mot de passe,
 * désactivation et suppression définitive.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS } from '@/constants/design';
import { generatePassword } from '@/lib/externAuth';
import { creerCompteMn } from '@/lib/menuiserie/auth';
import {
  enregistrerUsineMn, activerCompteMn, changerMotDePasseCompteMn, listerComptesMn, listerUsinesMn, modifierCompteMn, supprimerCompteMn,
} from '@/lib/menuiserie/api';
import type { CompteMn, RoleCompteMn, UsineMn } from '@/lib/menuiserie/types';
import { lireCacheMn, ecrireCacheMn } from '@/lib/menuiserie/cache';
import { ROLE_COMPTE_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Puce, Section } from '@/components/menuiserie/ui';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';

const ROLES: RoleCompteMn[] = ['admin', 'usine', 'employe_usine', 'client', 'architecte', 'apporteur', 'poseur'];
const VIDE = { nom: '', email: '', identifiant: '', telephone: '', motDePasse: '' };
/** Libellés explicites : ces rôles ne concernent QUE l'espace Menuiserie. */
const libelleRole = (r: RoleCompteMn) => (r === 'admin' ? 'Administrateur Menuiserie' : ROLE_COMPTE_MN_LABELS[r]);

function confirmer(titre: string, texte: string, ok: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${titre}\n\n${texte}`)) ok(); return; }
  Alert.alert(titre, texte, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: ok }]);
}

export default function ComptesMn() {
  const router = useRouter();
  const moi = useCompteMn();
  const [comptes, setComptes] = useState<CompteMn[]>(() => lireCacheMn<CompteMn[]>('comptes') || []);
  const [usines, setUsines] = useState<UsineMn[]>(() => lireCacheMn<UsineMn[]>('usines') || []);
  const [f, setF] = useState<typeof VIDE | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [role, setRole] = useState<RoleCompteMn>('admin');
  const [usineId, setUsineId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);

  const charger = useCallback(() => {
    listerComptesMn().then(c => { ecrireCacheMn('comptes', c); setComptes(c); }).catch(e => setMessage(e.message));
    listerUsinesMn().then(u => { ecrireCacheMn('usines', u); setUsines(u); }).catch(() => {});
  }, []);
  useEffect(charger, [charger]);

  const ouvrirNouveau = () => { setEditId(null); setF({ ...VIDE, motDePasse: generatePassword(10) }); setRole('admin'); setUsineId(null); setMessage(''); };
  const ouvrirEdition = (c: CompteMn) => {
    setEditId(c.id);
    setF({ nom: c.nom, email: c.email || '', identifiant: c.identifiant || '', telephone: c.telephone || '', motDePasse: '' });
    setRole(c.role); setUsineId(c.usine_id); setMessage('');
  };
  const fermer = () => { setF(null); setEditId(null); };

  const enregistrer = async () => {
    if (!f?.nom.trim()) { setMessage('Le nom est obligatoire.'); return; }
    if (role === 'employe_usine' && !usineId) { setMessage("Choisis l'usine de l'employé."); return; }
    setCharge(true); setMessage('');
    try {
      // Compte usine sans usine choisie : l'usine est créée automatiquement avec ce nom
      let usineCible = usineId;
      if (role === 'usine' && !usineCible) {
        await enregistrerUsineMn({ nom: f.nom.trim() });
        const liste = await listerUsinesMn();
        ecrireCacheMn('usines', liste); setUsines(liste);
        usineCible = liste.find(u => u.nom === f.nom.trim())?.id || null;
      }
      if (editId) {
        await modifierCompteMn({ id: editId, nom: f.nom, role, usineId: usineCible, identifiant: f.identifiant, email: f.email, telephone: f.telephone });
        if (f.motDePasse) await changerMotDePasseCompteMn(editId, f.motDePasse);
        setMessage(`Compte de ${f.nom.trim()} mis à jour.${f.motDePasse ? ` Nouveau mot de passe : ${f.motDePasse}` : ''}`);
      } else {
        const r = await creerCompteMn({ nom: f.nom, role, motDePasse: f.motDePasse, email: f.email, identifiant: f.identifiant, telephone: f.telephone, usineId: usineCible });
        if (!r.ok) { setMessage(r.erreur); return; }
        setMessage(`Compte créé. Communique à ${f.nom.trim()} : ${f.email.trim() || f.identifiant.trim()} / ${f.motDePasse}`);
      }
      fermer(); charger();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setCharge(false);
    }
  };

  const supprimer = () => {
    if (!editId || !f) return;
    confirmer('Supprimer ce compte ?', `${f.nom} ne pourra plus se connecter. Cette suppression est définitive.`, async () => {
      try { await supprimerCompteMn(editId); setMessage(`Compte de ${f.nom} supprimé.`); fermer(); charger(); }
      catch (e) { setMessage((e as Error).message); }
    });
  };

  const champ = (cle: keyof typeof VIDE, label: string, extra?: object) => (
    <Champ label={label} value={f?.[cle] || ''} onChangeText={v => setF(p => (p ? { ...p, [cle]: v } : p))} {...extra} />
  );
  const estMoi = editId === moi.id;

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre="Comptes Menuiserie" />
        <Text style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 18 }}>
          Ces comptes ne donnent accès qu'à l'espace Menuiserie. L'accès Travaux se règle dans Équipe (fiche de la personne).
        </Text>

        {f ? (
          <Carte>
            <Text style={{ fontSize: 17, fontWeight: '800', color: DS.text }}>{editId ? `Modifier ${f.nom}` : 'Nouveau compte'}</Text>
            {champ('nom', 'Nom affiché *')}
            <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>Rôle dans la Menuiserie</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ROLES.map(r => <Puce key={r} label={libelleRole(r)} actif={role === r} onPress={estMoi ? undefined : () => setRole(r)} />)}
            </View>
            {(role === 'usine' || role === 'employe_usine') && (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>
                  {role === 'usine' ? "Usine (laisse vide pour créer l'usine automatiquement avec ce nom)" : 'Usine'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {usines.map(u => <Puce key={u.id} label={u.nom} actif={usineId === u.id} onPress={() => setUsineId(u.id)} />)}
                </View>
              </>
            )}
            {champ('email', 'E-mail de connexion (permet « mot de passe oublié »)', { autoCapitalize: 'none', keyboardType: 'email-address' })}
            {champ('identifiant', 'Identifiant (si pas d’e-mail, ou en plus)', { autoCapitalize: 'none' })}
            {champ('telephone', 'Téléphone', { keyboardType: 'phone-pad' })}
            {champ('motDePasse', editId ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe (8 caractères min.)', { autoCapitalize: 'none' })}
            <Bouton label="Générer un mot de passe" variante="discret" onPress={() => setF(p => (p ? { ...p, motDePasse: generatePassword(10) } : p))} />
            <Bouton label={editId ? 'Enregistrer les modifications' : 'Créer le compte'} onPress={enregistrer} charge={charge} />
            {editId && !estMoi && (
              <Pressable onPress={supprimer} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: DS.error }}>Supprimer définitivement ce compte</Text>
              </Pressable>
            )}
            <Bouton label="Annuler" variante="discret" onPress={fermer} />
          </Carte>
        ) : (
          <Bouton label="+ Nouveau compte" onPress={ouvrirNouveau} />
        )}
        {!!message && <Carte><Text style={{ fontSize: 14, fontWeight: '600', color: DS.primary }} selectable>{message}</Text></Carte>}

        <Section>Comptes ({comptes.length}) · touche un compte pour le modifier</Section>
        {comptes.map(c => (
          <Pressable key={c.id} onPress={() => ouvrirEdition(c)} accessibilityRole="button" accessibilityLabel={`Modifier le compte de ${c.nom}`}>
            <Carte style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{c.nom}{c.id === moi.id ? ' (moi)' : ''}</Text>
                <Text style={{ fontSize: 13, color: DS.textSecondary }}>
                  {libelleRole(c.role)}{c.usine_id ? ` · ${usines.find(u => u.id === c.usine_id)?.nom || ''}` : ''} · {c.email || c.identifiant}
                </Text>
                {!c.actif && <Text style={{ fontSize: 12, fontWeight: '700', color: DS.error }}>Désactivé</Text>}
              </View>
              <Switch value={c.actif} disabled={c.id === moi.id} onValueChange={async v => { await activerCompteMn(c.id, v); charger(); }}
                trackColor={{ false: DS.border, true: DS.primary }} thumbColor={DS.surface} accessibilityLabel={`Compte ${c.nom} actif`} />
            </Carte>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

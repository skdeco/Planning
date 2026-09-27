/**
 * Comptes de l'espace Menuiserie (administrateur) : création avec e-mail et/ou
 * identifiant, rôle, usine rattachée ; activation / désactivation.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS } from '@/constants/design';
import { generatePassword } from '@/lib/externAuth';
import { creerCompteMn } from '@/lib/menuiserie/auth';
import { activerCompteMn, listerComptesMn, listerUsinesMn } from '@/lib/menuiserie/api';
import type { CompteMn, RoleCompteMn, UsineMn } from '@/lib/menuiserie/types';
import { ROLE_COMPTE_MN_LABELS } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Puce, Section } from '@/components/menuiserie/ui';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';

const ROLES: RoleCompteMn[] = ['admin', 'usine', 'employe_usine', 'client', 'architecte', 'apporteur', 'poseur'];
const VIDE = { nom: '', email: '', identifiant: '', telephone: '', motDePasse: '' };

export default function ComptesMn() {
  const router = useRouter();
  const moi = useCompteMn();
  const [comptes, setComptes] = useState<CompteMn[]>([]);
  const [usines, setUsines] = useState<UsineMn[]>([]);
  const [f, setF] = useState<typeof VIDE | null>(null);
  const [role, setRole] = useState<RoleCompteMn>('admin');
  const [usineId, setUsineId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);

  const charger = useCallback(() => {
    listerComptesMn().then(setComptes).catch(e => setMessage(e.message));
    listerUsinesMn().then(setUsines).catch(() => {});
  }, []);
  useEffect(charger, [charger]);

  const creer = async () => {
    if (!f?.nom.trim()) { setMessage('Le nom est obligatoire.'); return; }
    if ((role === 'usine' || role === 'employe_usine') && !usineId) { setMessage("Choisis l'usine de rattachement."); return; }
    setCharge(true); setMessage('');
    const r = await creerCompteMn({ nom: f.nom, role, motDePasse: f.motDePasse, email: f.email, identifiant: f.identifiant, telephone: f.telephone, usineId });
    setCharge(false);
    if (!r.ok) { setMessage(r.erreur); return; }
    setMessage(`Compte créé. Communique à ${f.nom.trim()} : ${f.email.trim() || f.identifiant.trim()} / ${f.motDePasse}`);
    setF(null); charger();
  };

  const champ = (cle: keyof typeof VIDE, label: string, extra?: object) => (
    <Champ label={label} value={f?.[cle] || ''} onChangeText={v => setF(p => (p ? { ...p, [cle]: v } : p))} {...extra} />
  );

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre="Comptes Menuiserie" retour={() => router.back()} />
        {f ? (
          <Carte>
            {champ('nom', 'Nom affiché *')}
            <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>Rôle</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ROLES.map(r => <Puce key={r} label={ROLE_COMPTE_MN_LABELS[r]} actif={role === r} onPress={() => setRole(r)} />)}
            </View>
            {(role === 'usine' || role === 'employe_usine') && (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>Usine</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {usines.map(u => <Puce key={u.id} label={u.nom} actif={usineId === u.id} onPress={() => setUsineId(u.id)} />)}
                </View>
              </>
            )}
            {champ('email', 'E-mail (permet « mot de passe oublié »)', { autoCapitalize: 'none', keyboardType: 'email-address' })}
            {champ('identifiant', 'Identifiant (si pas d’e-mail, ou en plus)', { autoCapitalize: 'none' })}
            {champ('telephone', 'Téléphone', { keyboardType: 'phone-pad' })}
            {champ('motDePasse', 'Mot de passe (8 caractères min.)', { autoCapitalize: 'none' })}
            <Bouton label="Générer un mot de passe" variante="discret" onPress={() => setF(p => (p ? { ...p, motDePasse: generatePassword(10) } : p))} />
            <Bouton label="Créer le compte" onPress={creer} charge={charge} />
            <Bouton label="Annuler" variante="discret" onPress={() => setF(null)} />
          </Carte>
        ) : (
          <Bouton label="+ Nouveau compte" onPress={() => { setF({ ...VIDE, motDePasse: generatePassword(10) }); setRole('admin'); setUsineId(null); setMessage(''); }} />
        )}
        {!!message && <Carte><Text style={{ fontSize: 14, fontWeight: '600', color: DS.primary }} selectable>{message}</Text></Carte>}

        <Section>Comptes ({comptes.length})</Section>
        {comptes.map(c => (
          <Carte key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{c.nom}</Text>
              <Text style={{ fontSize: 13, color: DS.textSecondary }}>
                {ROLE_COMPTE_MN_LABELS[c.role]}{c.usine_id ? ` · ${usines.find(u => u.id === c.usine_id)?.nom || ''}` : ''} · {c.email || c.identifiant}
              </Text>
            </View>
            <Switch value={c.actif} disabled={c.id === moi.id} onValueChange={async v => { await activerCompteMn(c.id, v); charger(); }}
              trackColor={{ false: DS.border, true: DS.primary }} thumbColor={DS.surface} accessibilityLabel={`Compte ${c.nom} actif`} />
          </Carte>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

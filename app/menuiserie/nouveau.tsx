/** Création d'un chantier Menuiserie : chantier, client, intervenants. */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS, radius } from '@/constants/design';
import { DateInput } from '@/components/ui/DateInput';
import { useCompteMn } from '@/lib/menuiserie/SessionMn';
import { creerChantierMn, listerUsinesMn } from '@/lib/menuiserie/api';
import type { UsineMn } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete, Puce, Section } from '@/components/menuiserie/ui';

import { tm } from '@/lib/menuiserie/i18n';
const VIDE = {
  nom: '', rue: '', code_postal: '', ville: '', code_acces: '', etage: '', cle: '',
  client_nom: '', client_societe: '', client_rue: '', client_code_postal: '', client_ville: '', client_tel: '', client_email: '',
  architecte: '', apporteur: '', responsable: '',
};

export default function NouveauChantierMn() {
  const router = useRouter();
  const moi = useCompteMn();
  const [f, setF] = useState(VIDE);
  const [usineId, setUsineId] = useState<string | null>(null);
  const [livraison, setLivraison] = useState('');
  const [usines, setUsines] = useState<UsineMn[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => { listerUsinesMn().then(setUsines).catch(() => {}); }, []);

  const champ = (cle: keyof typeof VIDE, label: string, extra?: object) => (
    <Champ label={tm(label)} value={f[cle]} onChangeText={v => setF(p => ({ ...p, [cle]: v }))} {...extra} />
  );

  const creer = async () => {
    if (!f.nom.trim()) { setErreur(tm("Le nom du chantier est obligatoire.")); return; }
    setCharge(true); setErreur('');
    try {
      const n = (s: string) => s.trim() || null;
      const id = await creerChantierMn(moi, {
        nom: f.nom.trim(), rue: n(f.rue), code_postal: n(f.code_postal), ville: n(f.ville),
        code_acces: n(f.code_acces), etage: n(f.etage), cle: n(f.cle), statut: 'en_cours',
        usine_id: usineId, date_livraison_prevue: livraison || null,
        client_nom: n(f.client_nom), client_societe: n(f.client_societe), client_rue: n(f.client_rue),
        client_code_postal: n(f.client_code_postal), client_ville: n(f.client_ville), client_tel: n(f.client_tel), client_email: n(f.client_email),
      }, [
        { role: 'client', nom: f.client_nom },
        { role: 'architecte', nom: f.architecte },
        { role: 'apporteur', nom: f.apporteur },
        { role: 'responsable', nom: f.responsable },
      ]);
      router.replace(`/menuiserie/chantier/${id}` as any);
    } catch (e) {
      setErreur((e as Error).message);
      setCharge(false);
    }
  };

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre={tm("Nouveau chantier")} retour={() => router.back()} />

        <Section>{tm("Chantier")}</Section>
        <Carte>
          {champ('nom', 'Nom du chantier *')}
          {champ('rue', 'Rue')}
          <View style={{ flexDirection: 'row', gap: 8 }}>{champ('code_postal', 'Code postal', { keyboardType: 'number-pad' })}{champ('ville', 'Ville')}</View>
          <View style={{ flexDirection: 'row', gap: 8 }}>{champ('code_acces', 'Code')}{champ('etage', 'Étage')}</View>
          {champ('cle', 'Clé (où la trouver)')}
          <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Date de livraison prévue")}</Text>
          <DateInput value={livraison} onChangeDate={setLivraison} accessibilityLabel={tm("Date de livraison prévue")}
            style={{ borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.background }} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm("Usine de production")}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Puce label={tm("À définir")} actif={!usineId} onPress={() => setUsineId(null)} />
            {usines.map(u => <Puce key={u.id} label={u.nom} actif={usineId === u.id} onPress={() => setUsineId(u.id)} />)}
          </View>
          {usines.length === 0 && <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm("Aucune usine : ajoute-les depuis l'accueil → Usines.")}</Text>}
        </Carte>

        <Section>{tm("Client")}</Section>
        <Carte>
          <View style={{ flexDirection: 'row', gap: 8 }}>{champ('client_nom', 'Nom Prénom')}{champ('client_societe', 'Société')}</View>
          {champ('client_rue', 'Rue')}
          <View style={{ flexDirection: 'row', gap: 8 }}>{champ('client_code_postal', 'Code postal', { keyboardType: 'number-pad' })}{champ('client_ville', 'Ville')}</View>
          <View style={{ flexDirection: 'row', gap: 8 }}>{champ('client_tel', 'Téléphone', { keyboardType: 'phone-pad' })}{champ('client_email', 'E-mail', { autoCapitalize: 'none', keyboardType: 'email-address' })}</View>
          <Text style={{ fontSize: 12, color: DS.textSecondary }}>{tm("L'accès client (identifiant / mot de passe) arrive à l'étape 2c.")}</Text>
        </Carte>

        <Section>{tm("Intervenants")}</Section>
        <Carte>
          {champ('architecte', 'Architecte')}
          {champ('apporteur', "Apporteur d'affaires")}
          {champ('responsable', 'Responsable chantier')}
        </Carte>

        {!!erreur && <Text style={{ color: DS.error, fontWeight: '700' }}>{erreur}</Text>}
        <Bouton label={tm("Créer le chantier")} onPress={creer} charge={charge} />
      </ScrollView>
    </ScreenContainer>
  );
}

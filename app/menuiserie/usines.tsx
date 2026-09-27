/** Liste et fiche des usines de production (administrateur). */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DS } from '@/constants/design';
import { enregistrerUsineMn, listerUsinesMn } from '@/lib/menuiserie/api';
import type { UsineMn } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, EnTete } from '@/components/menuiserie/ui';

const VIDE = { nom: '', contact_nom: '', contact_tel: '', contact_email: '', adresse: '' };

export default function UsinesMn() {
  const router = useRouter();
  const [usines, setUsines] = useState<UsineMn[]>([]);
  const [edition, setEdition] = useState<{ id?: string } & typeof VIDE | null>(null);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const charger = useCallback(() => { listerUsinesMn().then(setUsines).catch(e => setErreur(e.message)); }, []);
  useEffect(charger, [charger]);

  const enregistrer = async () => {
    if (!edition?.nom.trim()) { setErreur('Le nom est obligatoire.'); return; }
    setCharge(true); setErreur('');
    try {
      const n = (s: string) => s.trim() || null;
      await enregistrerUsineMn({ id: edition.id, nom: edition.nom.trim(), contact_nom: n(edition.contact_nom), contact_tel: n(edition.contact_tel), contact_email: n(edition.contact_email), adresse: n(edition.adresse) });
      setEdition(null); charger();
    } catch (e) { setErreur((e as Error).message); } finally { setCharge(false); }
  };

  const champ = (cle: keyof typeof VIDE, label: string) => (
    <Champ label={label} value={edition?.[cle] || ''} onChangeText={v => setEdition(p => (p ? { ...p, [cle]: v } : p))} />
  );

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }} keyboardShouldPersistTaps="handled">
        <EnTete titre="Usines" retour={() => router.back()} />
        {edition ? (
          <Carte>
            {champ('nom', "Nom de l'usine *")}
            {champ('contact_nom', 'Contact')}
            <View style={{ flexDirection: 'row', gap: 8 }}>{champ('contact_tel', 'Téléphone')}{champ('contact_email', 'E-mail')}</View>
            {champ('adresse', 'Adresse')}
            {!!erreur && <Text style={{ color: DS.error, fontWeight: '600' }}>{erreur}</Text>}
            <Bouton label="Enregistrer" onPress={enregistrer} charge={charge} />
            <Bouton label="Annuler" variante="discret" onPress={() => setEdition(null)} />
          </Carte>
        ) : (
          <Bouton label="+ Nouvelle usine" onPress={() => setEdition({ ...VIDE })} />
        )}
        {usines.map(u => (
          <Pressable key={u.id} accessibilityRole="button" onPress={() => setEdition({ id: u.id, nom: u.nom, contact_nom: u.contact_nom || '', contact_tel: u.contact_tel || '', contact_email: u.contact_email || '', adresse: u.adresse || '' })}>
            <Carte>
              <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{u.nom}</Text>
              <Text style={{ fontSize: 13, color: DS.textSecondary }}>{[u.contact_nom, u.contact_tel, u.contact_email].filter(Boolean).join(' · ') || 'Pas de contact renseigné'}</Text>
            </Carte>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

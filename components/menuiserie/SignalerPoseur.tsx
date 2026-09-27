/** Poseur : demande de matériel ou problème sur un meuble (photo, nouvelle cote, note). */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { DS } from '@/constants/design';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { deposerDocumentMn } from '@/lib/menuiserie/api';
import { signalerMn } from '@/lib/menuiserie/api2';
import type { CompteMn } from '@/lib/menuiserie/types';
import { Bouton, Carte, Champ, Puce, Section } from './ui';

export function SignalerPoseur({ moi, chantierId }: { moi: CompteMn; chantierId: string }) {
  const [type, setType] = useState<'materiel' | 'probleme'>('probleme');
  const [meuble, setMeuble] = useState('');
  const [texte, setTexte] = useState('');
  const [cote, setCote] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; mimeType: string; filename?: string }[]>([]);
  const [message, setMessage] = useState('');
  const [charge, setCharge] = useState(false);

  const envoyer = async () => {
    if (!texte.trim()) { setMessage('Décris la demande.'); return; }
    setCharge(true); setMessage('');
    try {
      await signalerMn(moi, { chantier_id: chantierId, type, texte, meuble, nouvelle_cote: cote });
      for (const p of photos) {
        await deposerDocumentMn(moi, {
          chantierId, etape: 'verification', uri: p.uri, mime: p.mimeType, visibilite: ['admin', 'poseur'],
          nom: `Problème ${meuble || ''} ${p.filename || 'photo.jpg'}`.trim(),
        });
      }
      setTexte(''); setCote(''); setMeuble(''); setPhotos([]);
      setMessage('Envoyé à SK DECO.');
    } catch (e) { setMessage((e as Error).message); } finally { setCharge(false); }
  };

  return (
    <>
      <Section>Signaler</Section>
      <Carte>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Puce label="Problème sur un meuble" actif={type === 'probleme'} onPress={() => setType('probleme')} />
          <Puce label="Demande de matériel" actif={type === 'materiel'} onPress={() => setType('materiel')} />
        </View>
        {type === 'probleme' && <Champ label="Meuble" value={meuble} onChangeText={setMeuble} />}
        <Champ label={type === 'probleme' ? 'Note (le problème)' : 'Matériel demandé'} value={texte} onChangeText={setTexte} multiline />
        {type === 'probleme' && <Champ label="Nouvelle cote (facultatif)" value={cote} onChangeText={setCote} />}
        {type === 'probleme' && (
          <Bouton label={photos.length ? `${photos.length} photo(s) jointe(s)` : '+ Joindre une photo'} variante="contour"
            onPress={async () => { const f = await pickNativeFile({ acceptCamera: true, acceptPdf: false, compressImages: true }); if (f.length) setPhotos(p => [...p, ...f]); }} />
        )}
        <Bouton label="Envoyer" onPress={envoyer} charge={charge} />
        {!!message && <Text style={{ fontSize: 13, fontWeight: '600', color: DS.primary }}>{message}</Text>}
      </Carte>
    </>
  );
}

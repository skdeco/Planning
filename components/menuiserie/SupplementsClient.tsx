/**
 * Espace client — suppléments au devis : ceux en attente demandent une réponse
 * (Accepter / Refuser) ; les autres affichent leur statut.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { DS } from '@/constants/design';
import type { CompteMn } from '@/lib/menuiserie/types';
import { repondreSupplementMn, type SupplementMn } from '@/lib/menuiserie/supplements';
import { StatutSupplement } from './SupplementsDevis';
import { euros } from './ui';
import { tm } from '@/lib/menuiserie/i18n';

function Supplement({ s, peutRepondre, onRepondu }: { s: SupplementMn; peutRepondre: boolean; onRepondu: () => void }) {
  const [refus, setRefus] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const attente = s.statut === 'propose';
  const repondre = async (accord: boolean) => {
    setCharge(true); setErreur('');
    try { await repondreSupplementMn(s.id, accord, commentaire); onRepondu(); } catch (e) { setErreur((e as Error).message); }
    setCharge(false);
  };

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8, backgroundColor: attente ? DS.warningSoft : DS.background, borderWidth: attente ? 1 : 0, borderColor: DS.warning }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: DS.text }}>{s.libelle}</Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: DS.text }}>+ {euros(Number(s.montant_ht))}</Text>
      </View>
      {!!s.description && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{s.description}</Text>}
      {attente && peutRepondre ? (
        charge ? <ActivityIndicator color={DS.primary} /> : refus ? (
          <View style={{ gap: 8 }}>
            <TextInput value={commentaire} onChangeText={setCommentaire} placeholder={tm("Motif (facultatif)")} placeholderTextColor={DS.textMuted}
              style={{ borderWidth: 1, borderColor: DS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.text, backgroundColor: DS.surface }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setRefus(false)} accessibilityRole="button" style={{ flex: 1, minHeight: 42, borderRadius: 999, borderWidth: 1, borderColor: DS.border, backgroundColor: DS.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }}>{tm("Annuler")}</Text>
              </Pressable>
              <Pressable onPress={() => repondre(false)} accessibilityRole="button" style={{ flex: 1, minHeight: 42, borderRadius: 999, backgroundColor: DS.error, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{tm("Confirmer le refus")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setRefus(true)} accessibilityRole="button" style={{ flex: 1, minHeight: 42, borderRadius: 999, borderWidth: 1, borderColor: DS.border, backgroundColor: DS.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.text }}>{tm("Refuser")}</Text>
            </Pressable>
            <Pressable onPress={() => repondre(true)} accessibilityRole="button" style={{ flex: 1, minHeight: 42, borderRadius: 999, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: DS.textInverse }}>{tm("Accepter")}</Text>
            </Pressable>
          </View>
        )
      ) : <View style={{ flexDirection: 'row' }}><StatutSupplement s={s} /></View>}
      {!!erreur && <Text style={{ fontSize: 12, color: DS.error }}>{erreur}</Text>}
    </View>
  );
}

export function SupplementsClient({ moi, liste, onChange }: { moi: CompteMn; liste: SupplementMn[]; onChange: () => void }) {
  if (!liste.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm("Suppléments")}</Text>
      {liste.map(s => <Supplement key={s.id} s={s} peutRepondre={moi.role === 'client'} onRepondu={onChange} />)}
    </View>
  );
}

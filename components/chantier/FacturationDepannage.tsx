/**
 * Dépannage : « Travaux et prix » — ce qui a été fait et le prix, pour ne pas
 * oublier de facturer. Visible par l'admin et les employés qu'il choisit
 * (ex. RH, qui établit la facture). Chaque ligne se coche « Facturé ».
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Alert, Platform } from 'react-native';
import { Check, Trash2 } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import type { LigneFacturationDepannage } from '@/app/types';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { DateInput } from '@/components/ui/DateInput';
import { DS, radius } from '@/constants/design';
import { sendPushNotification } from '@/hooks/useNotifications';
import { getAdminPushTokens } from '@/lib/notif/getAdminPushTokens';
import { formatEuro } from '@/lib/depannage/facturation';
import { tm } from '@/lib/menuiserie/i18n';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateFR = (s: string) => s.split('-').reverse().join('/');

export function FacturationDepannage({ chantierId, onClose }: { chantierId: string | null; onClose: () => void }) {
  const { data, currentUser, updateChantier } = useApp();
  const chantier = data.chantiers.find(c => c.id === chantierId);
  const isAdmin = currentUser?.role === 'admin';
  const [date, setDate] = useState(ymd(new Date()));
  const [travaux, setTravaux] = useState('');
  const [prix, setPrix] = useState('');

  if (!chantier) return null;
  const lignes = [...(chantier.facturationDepannage || [])].sort((a, b) => b.date.localeCompare(a.date));
  const acces = chantier.accesFacturationIds || [];
  const resteAFacturer = lignes.filter(l => !l.facture).reduce((s, l) => s + (l.prix || 0), 0);
  const enregistrer = (liste: LigneFacturationDepannage[], accesIds = acces) =>
    updateChantier({ ...chantier, facturationDepannage: liste, accesFacturationIds: accesIds });

  const ajouter = () => {
    const texte = travaux.trim();
    if (!texte) return;
    const montant = parseFloat(prix.replace(',', '.'));
    const moi = data.employes.find(e => e.id === currentUser?.employeId);
    const ligne: LigneFacturationDepannage = {
      id: `fd_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      date, travaux: texte, prix: isNaN(montant) ? undefined : montant,
      auteurId: currentUser?.employeId || 'admin', auteurNom: moi ? moi.prenom : 'Admin', creeLe: new Date().toISOString(),
    };
    enregistrer([...(chantier.facturationDepannage || []), ligne]);
    setTravaux(''); setPrix('');
    // Prévenir l'admin et les personnes qui ont accès (sauf l'auteur)
    const tokens = new Set(getAdminPushTokens(data.employes, data.adminEmployeId));
    data.employes.filter(e => acces.includes(e.id) && e.pushToken).forEach(e => tokens.add(e.pushToken!));
    if (moi?.pushToken) tokens.delete(moi.pushToken);
    sendPushNotification([...tokens], `À facturer : ${chantier.nom}`, `${texte.slice(0, 80)}${ligne.prix != null ? ` — ${formatEuro(ligne.prix)}` : ''}`).catch(() => {});
  };

  const basculerFacture = (id: string) =>
    enregistrer((chantier.facturationDepannage || []).map(l => (l.id === id ? { ...l, facture: !l.facture } : l)));

  const supprimer = (id: string) => {
    const go = () => enregistrer((chantier.facturationDepannage || []).filter(l => l.id !== id));
    if (Platform.OS === 'web') { if (window.confirm(tm('Supprimer cette ligne ?'))) go(); return; }
    Alert.alert(tm('Supprimer cette ligne ?'), '', [{ text: tm('Annuler'), style: 'cancel' }, { text: tm('Supprimer'), style: 'destructive', onPress: go }]);
  };

  const basculerAcces = (id: string) =>
    enregistrer(chantier.facturationDepannage || [], acces.includes(id) ? acces.filter(x => x !== id) : [...acces, id]);

  const champ = { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, backgroundColor: DS.surface, paddingHorizontal: 12, fontSize: 15, color: DS.text } as const;

  return (
    <ModalKeyboard visible={!!chantierId} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: DS.background }}>
        <PanelHeader title={tm('Travaux et prix')} sub={chantier.nom} onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 14 }} keyboardShouldPersistTaps="handled">
          {/* Nouvelle ligne */}
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 14, gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{tm('Ce qui a été fait')}</Text>
            <TextInput value={travaux} onChangeText={setTravaux} multiline placeholder={tm('Ex. remplacement du mitigeur, recherche de fuite…')}
              placeholderTextColor={DS.textMuted} style={[champ, { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }]} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <DateInput value={date} onChangeDate={v => setDate(v || ymd(new Date()))} style={champ} />
              </View>
              <TextInput value={prix} onChangeText={setPrix} keyboardType="decimal-pad" placeholder={tm('Prix HT (€)')}
                placeholderTextColor={DS.textMuted} style={[champ, { flex: 1 }]} />
            </View>
            <Pressable onPress={ajouter} disabled={!travaux.trim()} accessibilityRole="button"
              style={{ minHeight: 50, borderRadius: radius.full, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center', opacity: travaux.trim() ? 1 : 0.4 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: DS.textInverse }}>{tm('Enregistrer')}</Text>
            </Pressable>
          </View>

          {/* Historique */}
          {lignes.length > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 17, fontFamily: 'Manrope_500Medium', color: DS.text }}>{tm('Historique')}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: resteAFacturer > 0 ? DS.text : DS.textSecondary }}>{tm('Reste à facturer')} : {formatEuro(resteAFacturer)}</Text>
            </View>
          )}
          {lignes.map(l => (
            <View key={l.id} style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 14, gap: 6, opacity: l.facture ? 0.6 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 13, color: DS.textSecondary }}>{dateFR(l.date)}{l.auteurNom ? ` · ${l.auteurNom}` : ''}</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{l.prix != null ? formatEuro(l.prix) : '—'}</Text>
              </View>
              <Text style={{ fontSize: 15, color: DS.text }}>{l.travaux}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Pressable onPress={() => basculerFacture(l.id)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: radius.full, borderWidth: 1, borderColor: DS.primary, backgroundColor: l.facture ? DS.primary : DS.surface }}>
                  <Check size={14} color={l.facture ? DS.textInverse : DS.primary} strokeWidth={2.4} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: l.facture ? DS.textInverse : DS.primary }}>{l.facture ? tm('Facturé') : tm('Marquer facturé')}</Text>
                </Pressable>
                {isAdmin && (
                  <Pressable onPress={() => supprimer(l.id)} hitSlop={6} accessibilityLabel={tm('Supprimer')}
                    style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surfaceAlt }}>
                    <Trash2 size={15} color={DS.error} />
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          {/* Accès (admin) */}
          {isAdmin && (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{tm('Qui peut voir et compléter (en plus de vous)')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {data.employes.map(e => {
                  const on = acces.includes(e.id);
                  return (
                    <Pressable key={e.id} onPress={() => basculerAcces(e.id)}
                      style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: 'center', backgroundColor: on ? DS.primary : DS.surface, borderWidth: 1, borderColor: on ? DS.primary : DS.border }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: on ? DS.textInverse : DS.text }}>{e.prenom}{e.isRH ? ' (RH)' : ''}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </ModalKeyboard>
  );
}

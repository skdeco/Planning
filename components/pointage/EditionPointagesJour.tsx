/**
 * Admin / RH : modification libre des pointages d'un employé pour un jour
 * (heures, arrivée/départ, chantier, ajout, suppression), avec historique.
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput, Platform, Alert } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Pointage } from '@/app/types';
import { DS, radius } from '@/constants/design';
import { auteurCourant, modifierPointage, nomChantier, pointagesDuJour } from '@/lib/pointage/historique';
import { ChoixChantierModal } from './ChoixChantierModal';
import { tm } from '@/lib/menuiserie/i18n';

type Ligne = { id: string; type: 'debut' | 'fin'; heure: string; chantierId?: string; nouveau?: boolean; supprime?: boolean };
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateFR = (ymd: string) => ymd.split('-').reverse().join('/');
const leFR = (iso: string) => { const d = new Date(iso); return `${dateFR(iso.slice(0, 10))} ${d.toTimeString().slice(0, 5)}`; };

interface Props { visible: boolean; employeId: string | null; date: string; onFermer: () => void }

export function EditionPointagesJour({ visible, employeId, date, onFermer }: Props) {
  const { data, currentUser, addPointage, updatePointage, deletePointage, togglePresenceForcee } = useApp();
  const presenceForcee = !!employeId && (data.presencesForcees || []).some(pf => pf.employeId === employeId && pf.date === date);
  const existants = employeId ? pointagesDuJour(data.pointages, employeId, date) : [];
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [choixPour, setChoixPour] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (visible) { setLignes(existants.map(p => ({ id: p.id, type: p.type, heure: p.heure, chantierId: p.chantierId }))); setErreur(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, employeId, date]);

  const maj = (id: string, ch: Partial<Ligne>) => setLignes(ls => ls.map(l => (l.id === id ? { ...l, ...ch } : l)));
  const ajouter = () => {
    const visibles = lignes.filter(l => !l.supprime);
    const der = visibles[visibles.length - 1];
    setLignes(ls => [...ls, { id: `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`, type: der?.type === 'debut' ? 'fin' : 'debut', heure: '', chantierId: der?.chantierId, nouveau: true }]);
  };

  const enregistrer = () => {
    if (!employeId) return;
    const actives = lignes.filter(l => !l.supprime);
    if (actives.some(l => !HEURE.test(l.heure.trim()))) { setErreur(tm('Heure au format HH:MM.')); return; }
    const auteur = auteurCourant(currentUser, data.employes);
    for (const l of lignes) {
      const orig = data.pointages.find(p => p.id === l.id);
      if (l.supprime) { if (orig) deletePointage(orig.id); continue; }
      if (l.nouveau) {
        const p: Pointage = {
          id: l.id, employeId, date, type: l.type, heure: l.heure.trim(), chantierId: l.chantierId,
          timestamp: new Date(`${date}T${l.heure.trim()}:00`).toISOString(), latitude: null, longitude: null, adresse: null,
          saisieManuelle: true, saisieParId: auteur.id, saisiPar: auteur.nom, chantierManuel: !!l.chantierId,
          historique: [{ le: new Date().toISOString(), parId: auteur.id, parNom: auteur.nom, champ: 'creation', ancien: '', nouveau: `${l.heure.trim()} · ${nomChantier(l.chantierId, data.chantiers)}` }],
        };
        addPointage(p);
      } else if (orig) {
        const suivant = modifierPointage(orig, { heure: l.heure.trim(), type: l.type, chantierId: l.chantierId }, auteur, data.chantiers, true);
        if (suivant !== orig) updatePointage(suivant);
      }
    }
    onFermer();
  };

  const toutSupprimer = () => {
    const go = () => setLignes(ls => ls.map(l => ({ ...l, supprime: true })));
    if (Platform.OS === 'web') { if (window.confirm(tm('Supprimer tous les pointages de ce jour ?'))) go(); return; }
    Alert.alert(tm('Marquer absent'), tm('Supprimer tous les pointages de ce jour ?'), [{ text: tm('Annuler'), style: 'cancel' }, { text: tm('Supprimer'), style: 'destructive', onPress: go }]);
  };

  const emp = data.employes.find(e => e.id === employeId);
  const ligneChoix = lignes.find(l => l.id === choixPour);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onFermer}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 0.08 }} onPress={onFermer} />
        <View style={{ flex: 1, backgroundColor: DS.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: DS.text }}>{tm('Pointages du jour')}</Text>
          <Text style={{ fontSize: 14, color: DS.textSecondary }}>{emp ? `${emp.prenom} ${emp.nom}` : ''} — {dateFR(date)}</Text>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            {lignes.filter(l => !l.supprime).map(l => {
              const orig = data.pointages.find(p => p.id === l.id);
              const ch = data.chantiers.find(c => c.id === l.chantierId);
              return (
                <View key={l.id} style={{ backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: 10, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {(['debut', 'fin'] as const).map(ty => (
                      <Pressable key={ty} onPress={() => maj(l.id, { type: ty })} accessibilityRole="button" accessibilityState={{ selected: l.type === ty }}
                        style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: radius.full, justifyContent: 'center', backgroundColor: l.type === ty ? DS.primary : DS.surfaceAlt }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: l.type === ty ? DS.textInverse : DS.text }}>{ty === 'debut' ? tm('Arrivée') : tm('Départ')}</Text>
                      </Pressable>
                    ))}
                    <TextInput value={l.heure} onChangeText={v => maj(l.id, { heure: v })} placeholder="HH:MM" placeholderTextColor={DS.textMuted}
                      keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel={tm('Heure')}
                      style={{ width: 72, marginLeft: 'auto', borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: 16, fontWeight: '700', color: DS.text, textAlign: 'center' }} />
                    <Pressable onPress={() => maj(l.id, { supprime: true })} accessibilityRole="button" accessibilityLabel={tm('Supprimer')} style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18, color: DS.error }}>✕</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => setChoixPour(l.id)} accessibilityRole="button"
                    style={{ minHeight: 36, borderRadius: radius.full, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: ch ? DS.surfaceAlt : DS.warningSoft, borderWidth: 1, borderColor: ch?.couleur || DS.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: DS.text }} numberOfLines={1}>{ch ? `${ch.nom}  ▾` : tm('Choisir le chantier  ▾')}</Text>
                  </Pressable>
                  {orig?.horsZone && <Text style={{ fontSize: 12, color: DS.warning, fontWeight: '700' }}>{tm('Pointé hors zone')}{orig.distanceChantier ? ` (${orig.distanceChantier} m)` : ''}</Text>}
                  {(orig?.historique || []).map((h, i) => (
                    <Text key={i} style={{ fontSize: 11.5, color: DS.textSecondary }}>
                      {h.champ === 'creation' ? tm('Ajouté') : h.champ === 'chantier' ? tm('Chantier') : h.champ === 'type' ? tm('Type') : tm('Heure')}
                      {h.champ === 'creation' ? ` : ${h.nouveau}` : ` : ${h.champ === 'type' ? (h.ancien === 'debut' ? tm('Arrivée') : tm('Départ')) : h.ancien} → ${h.champ === 'type' ? (h.nouveau === 'debut' ? tm('Arrivée') : tm('Départ')) : h.nouveau}`}
                      {' · '}{h.parNom} · {leFR(h.le)}
                    </Text>
                  ))}
                </View>
              );
            })}
            <Pressable onPress={ajouter} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: DS.primary }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: DS.primary }}>{tm('+ Ajouter un pointage')}</Text>
            </Pressable>
            {/* Présence sans pointage : l'admin peut marquer présent, puis saisir les heures ci-dessus */}
            {!!employeId && (
              <Pressable onPress={() => togglePresenceForcee(employeId, date, auteurCourant(currentUser, data.employes).nom)} accessibilityRole="button"
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: presenceForcee ? '#F0FFF4' : DS.surface, borderWidth: 1, borderColor: presenceForcee ? '#C6F6D5' : DS.border }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#2E7D32', backgroundColor: presenceForcee ? '#2E7D32' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  {presenceForcee && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>✓</Text>}
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: DS.text }}>{tm('Présent (même sans pointage)')}</Text>
              </Pressable>
            )}
            {lignes.some(l => !l.supprime) && (
              <Pressable onPress={toutSupprimer} accessibilityRole="button" style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.error }}>{tm('Marquer absent (supprimer tous les pointages)')}</Text>
              </Pressable>
            )}
            {!!erreur && <Text style={{ color: DS.error, fontWeight: '700' }}>{erreur}</Text>}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 20 }}>
            <Pressable onPress={onFermer} accessibilityRole="button" style={{ flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DS.border, backgroundColor: DS.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{tm('Annuler')}</Text>
            </Pressable>
            <Pressable onPress={enregistrer} accessibilityRole="button" style={{ flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.primary }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: DS.textInverse }}>{tm('Enregistrer')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <ChoixChantierModal
        visible={!!choixPour} titre={tm('Chantier du pointage')} chantiers={data.chantiers} proches={[]}
        selectionId={ligneChoix?.chantierId}
        onChoisir={id => { if (choixPour) maj(choixPour, { chantierId: id }); setChoixPour(null); }}
        onFermer={() => setChoixPour(null)}
      />
    </Modal>
  );
}

/**
 * Fiche d'un employé sur un chantier pour un jour (appui sur sa pastille dans le planning) :
 * horaire et description facultatifs, notes, déplacer, atelier, retirer.
 * Les employés la voient en lecture seule (horaire et description de leur tâche).
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Alert, Platform } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { useCellAffectationManager } from '@/hooks/useCellAffectationManager';
import { DS, radius } from '@/constants/design';
import { tm } from '@/lib/menuiserie/i18n';
import { ModalKeyboard } from '@/components/ModalKeyboard';

export interface CibleAffectation { chantierId: string; employeId: string; date: string }

interface Props {
  cible: CibleAffectation | null;
  onFermer: () => void;
  onNotes: (c: CibleAffectation) => void;
  onDeplacer: (c: CibleAffectation) => void;
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const normaliser = (v: string) => {
  const t = v.trim().replace('h', ':').replace('.', ':');
  if (/^\d{1,2}$/.test(t)) return `${t.padStart(2, '0')}:00`;
  if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0');
  return t;
};
const dateFR = (ymd: string) => ymd.split('-').reverse().join('/');

export function FicheAffectationJour({ cible, onFermer, onNotes, onDeplacer }: Props) {
  const { data, currentUser, updateAffectation } = useApp();
  const { toggleLieuTravail, removeEmployeFromCell } = useCellAffectationManager();
  const isAdmin = currentUser?.role === 'admin';
  const aff = cible ? data.affectations.find(a => a.chantierId === cible.chantierId && a.employeId === cible.employeId && a.dateDebut <= cible.date && a.dateFin >= cible.date) : undefined;
  const detail = cible ? aff?.details?.[cible.date] : undefined;
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [description, setDescription] = useState('');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    setDebut(detail?.debut || ''); setFin(detail?.fin || ''); setDescription(detail?.description || ''); setErreur('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible?.chantierId, cible?.employeId, cible?.date]);

  if (!cible) return null;
  const emp = data.employes.find(e => e.id === cible.employeId);
  const ch = data.chantiers.find(c => c.id === cible.chantierId);

  const enregistrer = () => {
    if (!aff) { onFermer(); return; }
    const d = normaliser(debut), f = normaliser(fin);
    if ((d && !HEURE.test(d)) || (f && !HEURE.test(f))) { setErreur(tm('Heure au format HH:MM.')); return; }
    const details = { ...(aff.details || {}) };
    if (d || f || description.trim()) details[cible.date] = { debut: d || undefined, fin: f || undefined, description: description.trim() || undefined };
    else delete details[cible.date];
    updateAffectation({ ...aff, details });
    onFermer();
  };

  const retirer = () => {
    const hasPointage = data.pointages.some(p => p.employeId === cible.employeId && p.date === cible.date);
    const go = (suppr: boolean) => { removeEmployeFromCell(cible.chantierId, cible.employeId, cible.date, { deletePointages: suppr }); onFermer(); };
    const titre = tm('Retirer {0} de ce jour ?', emp?.prenom || '');
    if (Platform.OS === 'web') { if (window.confirm(titre)) go(false); return; }
    Alert.alert(titre, undefined, [
      { text: tm('Annuler'), style: 'cancel' },
      { text: tm('Retirer du planning'), style: 'destructive', onPress: () => go(false) },
      ...(hasPointage ? [{ text: tm('Retirer + supprimer le pointage'), style: 'destructive' as const, onPress: () => go(true) }] : []),
    ]);
  };

  const champ = { borderWidth: 1, borderColor: DS.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15, color: DS.text, backgroundColor: DS.surface };
  const action = (label: string, onPress: () => void, danger?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ flexGrow: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: danger ? '#FECACA' : DS.border, backgroundColor: danger ? '#FEF2F2' : DS.surface }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: danger ? DS.error : DS.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <ModalKeyboard visible transparent animationType="slide" onRequestClose={onFermer}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onFermer} />
        <View style={{ backgroundColor: DS.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 16, paddingBottom: 32, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: DS.text }}>{emp ? `${emp.prenom} ${emp.nom}` : ''}</Text>
              <Text style={{ fontSize: 13, color: DS.textSecondary }}>{ch?.nom} · {dateFR(cible.date)}{aff?.lieu === 'atelier' ? ` · ${tm('Atelier')}` : ''}</Text>
            </View>
            <Pressable onPress={onFermer} hitSlop={10} accessibilityLabel={tm('Fermer')} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: DS.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: DS.text }}>✕</Text>
            </Pressable>
          </View>

          {isAdmin ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm('Horaire (facultatif)')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput value={debut} onChangeText={setDebut} placeholder="08:00" placeholderTextColor={DS.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} style={[champ, { width: 84, textAlign: 'center' }]} accessibilityLabel={tm('Début')} />
                <Text style={{ color: DS.textSecondary }}>→</Text>
                <TextInput value={fin} onChangeText={setFin} placeholder="12:00" placeholderTextColor={DS.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} style={[champ, { width: 84, textAlign: 'center' }]} accessibilityLabel={tm('Fin')} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textSecondary }}>{tm('Description (facultatif)')}</Text>
              <TextInput value={description} onChangeText={setDescription} placeholder={tm('Ex. pose faïence salle de bain')} placeholderTextColor={DS.textMuted} multiline style={[champ, { minHeight: 60, textAlignVertical: 'top' }]} />
              {!!erreur && <Text style={{ color: DS.error, fontWeight: '700' }}>{erreur}</Text>}
              <Pressable onPress={enregistrer} accessibilityRole="button" style={{ minHeight: 46, borderRadius: radius.md, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: DS.textInverse, fontWeight: '800', fontSize: 15 }}>{tm('Enregistrer')}</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {action(tm('Notes & tâches'), () => { onFermer(); onNotes(cible); })}
                {action(tm('↔ Déplacer'), () => { onFermer(); onDeplacer(cible); })}
                {action(aff?.lieu === 'atelier' ? tm('Remettre sur chantier') : tm('Mettre en atelier'), () => { toggleLieuTravail(cible.chantierId, cible.employeId, cible.date); onFermer(); })}
                {action(tm('Retirer'), retirer, true)}
              </View>
            </>
          ) : (
            <>
              {(detail?.debut || detail?.fin) && <Text style={{ fontSize: 16, fontWeight: '800', color: DS.text }}>{detail?.debut || '…'} → {detail?.fin || '…'}</Text>}
              {!!detail?.description && <Text style={{ fontSize: 15, color: DS.text, lineHeight: 21 }}>{detail.description}</Text>}
              {!detail && <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm('Pas de précision pour ce jour.')}</Text>}
              {action(tm('Notes & tâches'), () => { onFermer(); onNotes(cible); })}
            </>
          )}
        </View>
      </View>
    </ModalKeyboard>
  );
}

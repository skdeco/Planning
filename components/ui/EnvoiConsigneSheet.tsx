/**
 * EnvoiConsigneSheet — « Envoyer aux employés ».
 *
 * Transforme un texte (note de direction, ligne de compte rendu…) en consigne du
 * jour pour les employés choisis, à la date choisie. Chaque employé reçoit sa
 * propre note dans son planning, avec une case à cocher.
 *
 * Quand la consigne vient d'une ligne de compte rendu (`origineCR`), le cochage
 * par l'employé coche aussi la ligne du CR (voir toggleTask dans AppContext).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { DS, radius, shadows, font } from '@/constants/design';
import { DateInput } from '@/components/ui/DateInput';
import { todayYMD } from '@/lib/date/today';
import { formatDateFR } from '@/lib/date/format';
import type { Note } from '@/app/types';

export interface ConsigneAEnvoyer {
  chantierId: string;
  /** Texte de la consigne (devient une tâche cochable). */
  texte: string;
  photos?: string[];
  /** Ligne de compte rendu d'origine, pour synchroniser le cochage. */
  origineCR?: { suiviId: string; itemId: string };
}

export interface EnvoiConsigneSheetProps {
  consigne: ConsigneAEnvoyer | null;
  onClose: () => void;
  /** Appelé après l'envoi, avec les employés et la date retenus. */
  onEnvoye?: (employeIds: string[], date: string) => void;
}

function addJours(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EnvoiConsigneSheet({ consigne, onClose, onEnvoye }: EnvoiConsigneSheetProps) {
  const { data, currentUser, upsertNote } = useApp();
  const { t } = useLanguage();
  const aujourdhui = todayYMD();
  const demain = addJours(aujourdhui, 1);

  const [date, setDate] = useState(aujourdhui);
  const [autreDate, setAutreDate] = useState(false);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());

  // Employés du chantier dans les 15 prochains jours d'abord, puis les autres.
  const employes = useMemo(() => {
    if (!consigne) return [];
    const fin = addJours(aujourdhui, 15);
    const surChantier = new Set(
      data.affectations
        .filter(a => a.chantierId === consigne.chantierId && !a.soustraitantId && a.dateFin >= aujourdhui && a.dateDebut <= fin)
        .map(a => a.employeId),
    );
    const actifs = data.employes.filter(e => e.role !== 'admin');
    return [
      ...actifs.filter(e => surChantier.has(e.id)).map(e => ({ ...e, surChantier: true })),
      ...actifs.filter(e => !surChantier.has(e.id)).map(e => ({ ...e, surChantier: false })),
    ];
  }, [consigne, data.affectations, data.employes, aujourdhui]);

  if (!consigne) return null;

  const basculer = (id: string) => setChoisis(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const envoyer = () => {
    const ids = Array.from(choisis);
    if (ids.length === 0 || !date) return;
    const now = new Date().toISOString();
    const auteurNom = currentUser?.nom || 'Admin';
    ids.forEach(employeId => {
      const note: Note = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        auteurId: 'admin',
        auteurNom,
        date,
        texte: '',
        photos: consigne.photos || [],
        tasks: [{
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          texte: consigne.texte,
          fait: false,
          ...(consigne.origineCR ? { origineCR: consigne.origineCR } : {}),
        }],
        createdAt: now,
        updatedAt: now,
      };
      upsertNote({ chantierId: consigne.chantierId, employeId, date, note });
    });
    onEnvoye?.(ids, date);
    onClose();
  };

  const chantierNom = data.chantiers.find(c => c.id === consigne.chantierId)?.nom || '';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>{t.ui.envoyerAuxEmployes}</Text>
              <Text style={styles.sous} numberOfLines={1}>{chantierNom}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X size={18} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.apercu}>
            <Text style={styles.apercuTexte} numberOfLines={3}>{consigne.texte}</Text>
          </View>

          {/* Date */}
          <Text style={styles.label}>{t.ui.pourQuelJour}</Text>
          <View style={styles.segment}>
            {[
              { cle: aujourdhui, lib: t.common.today },
              { cle: demain, lib: t.ui.demain },
            ].map(o => {
              const actif = !autreDate && date === o.cle;
              return (
                <Pressable key={o.cle} style={[styles.segBtn, actif && styles.segBtnOn]} onPress={() => { setAutreDate(false); setDate(o.cle); }}>
                  <Text style={[styles.segText, actif && styles.segTextOn]}>{o.lib}</Text>
                </Pressable>
              );
            })}
            <Pressable style={[styles.segBtn, autreDate && styles.segBtnOn]} onPress={() => setAutreDate(true)}>
              <Text style={[styles.segText, autreDate && styles.segTextOn]}>{t.ui.autreDate}</Text>
            </Pressable>
          </View>
          {autreDate && (
            <DateInput style={styles.dateInput} value={date} onChangeDate={v => v && setDate(v)} />
          )}

          {/* Employés */}
          <Text style={styles.label}>{t.ui.pourQui}</Text>
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
            {employes.map(e => {
              const on = choisis.has(e.id);
              return (
                <Pressable key={e.id} style={[styles.row, on && styles.rowOn]} onPress={() => basculer(e.id)}>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on && <Check size={14} color="#fff" strokeWidth={2.6} />}
                  </View>
                  <Text style={styles.rowText} numberOfLines={1}>{e.prenom} {e.nom}</Text>
                  {e.surChantier && <Text style={styles.rowTag}>{t.ui.surCeChantier}</Text>}
                </Pressable>
              );
            })}
            {employes.length === 0 && <Text style={styles.vide}>{t.ui.aucunEmploye}</Text>}
          </ScrollView>

          <Pressable
            style={[styles.envoyerBtn, (choisis.size === 0 || !date) && { opacity: 0.4 }]}
            disabled={choisis.size === 0 || !date}
            onPress={envoyer}
          >
            <Text style={styles.envoyerText}>
              {t.common.send}{choisis.size > 0 ? ` (${choisis.size})` : ''} · {formatDateFR(date)}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(43,29,20,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: DS.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 26, gap: 10, maxHeight: '92%' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titre: { fontFamily: 'Fraunces_600SemiBold', fontSize: 22, lineHeight: 28, color: DS.text },
  sous: { fontSize: 13.5, color: DS.textSecondary, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  apercu: { backgroundColor: DS.surface, borderRadius: radius.lg, padding: 12, ...shadows.sm },
  apercuTexte: { fontSize: 14.5, color: DS.text, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: font.semibold, letterSpacing: 0.4, textTransform: 'uppercase', color: DS.textSecondary, marginTop: 4, paddingHorizontal: 4 },
  segment: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: radius.full, backgroundColor: DS.segment },
  segBtn: { flex: 1, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: DS.surface, ...shadows.sm },
  segText: { fontSize: 13, fontWeight: font.medium, color: DS.text },
  segTextOn: { fontWeight: font.semibold, color: DS.primary },
  dateInput: { backgroundColor: DS.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: DS.text, borderWidth: 1, borderColor: DS.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: DS.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: DS.border },
  rowOn: { borderColor: DS.primary },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.8, borderColor: DS.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: DS.primary, borderColor: DS.primary },
  rowText: { flex: 1, fontSize: 15, color: DS.text },
  rowTag: { fontSize: 11.5, color: DS.primary, backgroundColor: DS.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  vide: { fontSize: 13.5, color: DS.textSecondary, textAlign: 'center', paddingVertical: 12 },
  envoyerBtn: { height: 50, borderRadius: radius.full, backgroundColor: DS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  envoyerText: { fontSize: 15.5, fontWeight: font.semibold, color: DS.textInverse },
});

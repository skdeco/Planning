/**
 * Formulaire RDV du Planning direction, version simplifiée :
 * Titre · Date / Début / Fin sur une ligne (sélecteurs compacts) · Chantier · Couleur.
 * Description, lieu, récurrence, invités et visibilité sont sous « Plus d'options ».
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import { ModalKeyboard } from '@/components/ModalKeyboard';
import { useApp } from '@/app/context/AppContext';
import { tm, localeMn } from '@/lib/menuiserie/i18n';

export const COULEURS_RDV = ['#2C2C2C', '#27AE60', '#E74C3C', '#F59E0B', '#9B59B6', '#00BCD4', '#FF6B35'];

export interface FormRdv {
  titre: string; description: string; date: string; heureDebut: string; heureFin: string;
  lieu: string; couleur: string; invites: string[]; visiblePar: string[];
  chantierId: string; recurrence: string; recurrenceFinDate: string;
}

const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minutes = (h: string) => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Heures de 06:00 à 22:00, toutes les 30 min */
const HEURES = Array.from({ length: 33 }, (_, i) => hhmm(360 + i * 30));
const dateCourte = (ymd: string) => new Date(ymd + 'T12:00:00').toLocaleDateString(localeMn(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

interface Props {
  visible: boolean;
  editId: string | null;
  form: FormRdv;
  setForm: React.Dispatch<React.SetStateAction<FormRdv>>;
  invitables: { cle: string; nom: string }[];
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

type Selecteur = 'date' | 'debut' | 'fin' | 'finRecurrence' | null;

export function FormulaireRdvDirection({ visible, editId, form, setForm, invitables, onSave, onDelete, onClose }: Props) {
  const { data } = useApp();
  const [plus, setPlus] = useState(false);
  const [selecteur, setSelecteur] = useState<Selecteur>(null);

  const dates = useMemo(() => {
    const out: string[] = [];
    const d = new Date(); d.setDate(d.getDate() - 7);
    for (let i = 0; i < 120; i++) { out.push(toYMD(d)); d.setDate(d.getDate() + 1); }
    if (form.date && !out.includes(form.date)) out.unshift(form.date);
    return out;
  }, [form.date]);

  const options = selecteur === 'date' || selecteur === 'finRecurrence'
    ? dates.map(v => ({ v, l: dateCourte(v) }))
    : selecteur === 'fin'
      ? HEURES.filter(h => minutes(h) > minutes(form.heureDebut)).map(v => ({ v, l: `${v}  (${((minutes(v) - minutes(form.heureDebut)) / 60).toString().replace('.', ',')} h)` }))
      : HEURES.map(v => ({ v, l: v }));

  const choisir = (v: string) => {
    if (selecteur === 'date') setForm(f => ({ ...f, date: v }));
    if (selecteur === 'finRecurrence') setForm(f => ({ ...f, recurrenceFinDate: v }));
    // Changer le début décale la fin en gardant la durée
    if (selecteur === 'debut') setForm(f => {
      const duree = f.heureFin ? Math.max(30, minutes(f.heureFin) - minutes(f.heureDebut)) : 60;
      return { ...f, heureDebut: v, heureFin: hhmm(Math.min(minutes(v) + duree, 23 * 60 + 30)) };
    });
    if (selecteur === 'fin') setForm(f => ({ ...f, heureFin: v }));
    setSelecteur(null);
  };

  const champCompact = (label: string, valeur: string, s: Selecteur, flex = 1) => (
    <Pressable onPress={() => setSelecteur(s)} accessibilityRole="button" accessibilityLabel={label} style={{ flex, gap: 2 }}>
      <Text style={labelStyle}>{label}</Text>
      <View style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }]}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#2B1D14' }} numberOfLines={1}>{valeur}</Text>
        <Text style={{ fontSize: 12, color: '#6E5F54' }}>▾</Text>
      </View>
    </Pressable>
  );

  return (
    <ModalKeyboard visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' }} onPress={e => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 20, fontFamily: 'Fraunces_600SemiBold', color: '#2B1D14' }}>{editId ? tm('Modifier') : tm('Nouveau RDV')}</Text>
              {editId && (
                <Pressable onPress={onDelete} style={{ padding: 6 }} accessibilityRole="button">
                  <Text style={{ color: '#E74C3C', fontWeight: '600' }}>{tm('Supprimer')}</Text>
                </Pressable>
              )}
            </View>

            <Text style={labelStyle}>{tm('Titre *')}</Text>
            <TextInput style={inputStyle} value={form.titre} onChangeText={v => setForm(f => ({ ...f, titre: v }))} placeholder={tm('Réunion, visite...')} autoFocus={!editId} />

            {champCompact(tm('Date'), dateCourte(form.date), 'date')}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {champCompact(tm('Début'), form.heureDebut, 'debut')}
              {champCompact(tm('Fin'), form.heureFin || '—', 'fin')}
            </View>

            <Text style={labelStyle}>{tm('Chantier associé')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              <Pressable style={chipStyle(!form.chantierId)} onPress={() => setForm(f => ({ ...f, chantierId: '' }))}>
                <Text style={chipTextStyle(!form.chantierId)}>{tm('Aucun')}</Text>
              </Pressable>
              {data.chantiers.filter(c => c.statut === 'actif' || c.statut === 'sav' || c.id === form.chantierId).map(c => (
                <Pressable key={c.id} style={chipStyle(form.chantierId === c.id, c.couleur)} onPress={() => setForm(f => ({ ...f, chantierId: f.chantierId === c.id ? '' : c.id }))}>
                  <Text style={chipTextStyle(form.chantierId === c.id)}>{c.nom}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={labelStyle}>{tm('Couleur')}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
              {COULEURS_RDV.map(c => (
                <Pressable key={c} onPress={() => setForm(f => ({ ...f, couleur: c }))} accessibilityRole="button" accessibilityState={{ selected: form.couleur === c }}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: form.couleur === c ? 3 : 0, borderColor: '#2B1D14' }} />
              ))}
            </View>

            <Pressable onPress={() => setPlus(p => !p)} accessibilityRole="button" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#5C1F2E' }}>{plus ? tm("Moins d'options") : tm("Plus d'options")}</Text>
              <Text style={{ fontSize: 12, color: '#5C1F2E' }}>{plus ? '▴' : '▾'}</Text>
            </Pressable>

            {plus && (
              <>
                <Text style={labelStyle}>{tm('Description')}</Text>
                <TextInput style={[inputStyle, { minHeight: 50 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline />
                <Text style={labelStyle}>{tm('Lieu')}</Text>
                <TextInput style={inputStyle} value={form.lieu} onChangeText={v => setForm(f => ({ ...f, lieu: v }))} placeholder={tm('Adresse...')} />
                <Text style={labelStyle}>{tm('Récurrence')}</Text>
                <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                  {[{ l: tm('Aucune'), v: 'aucune' }, { l: tm('Quotidien'), v: 'quotidien' }, { l: tm('Hebdo'), v: 'hebdomadaire' }, { l: tm('Mensuel'), v: 'mensuel' }].map(r => (
                    <Pressable key={r.v} style={chipStyle(form.recurrence === r.v)} onPress={() => setForm(f => ({ ...f, recurrence: r.v }))}>
                      <Text style={chipTextStyle(form.recurrence === r.v)}>{r.l}</Text>
                    </Pressable>
                  ))}
                </View>
                {form.recurrence !== 'aucune' && champCompact(tm('Fin de récurrence'), form.recurrenceFinDate ? dateCourte(form.recurrenceFinDate) : tm('Sélectionner...'), 'finRecurrence')}
                <Text style={labelStyle}>{tm('Invités (participants)')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {invitables.map(p => (
                    <Pressable key={p.cle} style={chipStyle(form.invites.includes(p.cle))}
                      onPress={() => setForm(f => ({ ...f, invites: f.invites.includes(p.cle) ? f.invites.filter(i => i !== p.cle) : [...f.invites, p.cle] }))}>
                      <Text style={chipTextStyle(form.invites.includes(p.cle))}>{p.nom}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={labelStyle}>{tm('Visible par (sans être invité)')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {data.employes.filter(e => !form.invites.includes(e.id)).map(emp => (
                    <Pressable key={emp.id} style={chipStyle(form.visiblePar.includes(emp.id))}
                      onPress={() => setForm(f => ({ ...f, visiblePar: f.visiblePar.includes(emp.id) ? f.visiblePar.filter(i => i !== emp.id) : [...f.visiblePar, emp.id] }))}>
                      <Text style={chipTextStyle(form.visiblePar.includes(emp.id))}>{emp.prenom} {emp.nom.charAt(0)}.</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Pressable style={{ marginTop: 12, backgroundColor: '#5C1F2E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: form.titre.trim() ? 1 : 0.5 }}
              onPress={onSave} disabled={!form.titre.trim()} accessibilityRole="button">
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editId ? tm('Enregistrer') : tm('Créer le rendez-vous')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      {/* Liste déroulante compacte (date ou heure) */}
      <Modal visible={!!selecteur} transparent animationType="fade" onRequestClose={() => setSelecteur(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={() => setSelecteur(null)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 8, width: '100%', maxWidth: 320, maxHeight: 420 }}>
            <ScrollView>
              {options.map(o => {
                const actif = (selecteur === 'date' && o.v === form.date) || (selecteur === 'debut' && o.v === form.heureDebut)
                  || (selecteur === 'fin' && o.v === form.heureFin) || (selecteur === 'finRecurrence' && o.v === form.recurrenceFinDate);
                return (
                  <Pressable key={o.v} onPress={() => choisir(o.v)} accessibilityRole="button"
                    style={{ paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: actif ? '#F2E4E1' : undefined }}>
                    <Text style={{ fontSize: 15, color: '#2B1D14', fontWeight: actif ? '800' : '500' }}>{o.l}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </ModalKeyboard>
  );
}

const labelStyle = { fontSize: 12, fontWeight: '600' as const, color: '#6E5F54', marginBottom: 2, marginTop: 8 };
const inputStyle = { backgroundColor: '#F1E7DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#EDE2D6' };
const chipStyle = (active: boolean, color?: string) => ({
  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14,
  backgroundColor: active ? (color || '#5C1F2E') : '#F1E7DC',
  borderWidth: 1, borderColor: active ? (color || '#5C1F2E') : '#EDE2D6',
});
const chipTextStyle = (active: boolean) => ({ fontSize: 12, fontWeight: '600' as const, color: active ? '#fff' : '#6E5F54' });

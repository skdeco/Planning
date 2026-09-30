/**
 * Formulaire RDV du Planning direction, version simplifiée :
 * Titre · Date / Début / Fin · Chantier · Couleur, puis « Plus d'options »
 * (description, lieu, récurrence, invités, visibilité).
 * Tous les choix se font par listes déroulantes (simple ou multiple), pas par grilles de pastilles.
 * La feuille est une View (et non un Pressable) pour que le défilement au doigt marche partout.
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
/** Sélecteur d'heure : heures de 6 h à 23 h, minutes par tranches de 15 */
const HEURES_H = Array.from({ length: 18 }, (_, i) => i + 6);
const MINUTES_Q = [0, 15, 30, 45];
const LIGNE = 48;
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

type Liste = 'date' | 'debut' | 'fin' | 'finRecurrence' | 'chantier' | 'recurrence' | 'invites' | 'visible' | null;
type Option = { v: string; l: string; couleur?: string };

export function FormulaireRdvDirection({ visible, editId, form, setForm, invitables, onSave, onDelete, onClose }: Props) {
  const { data } = useApp();
  const [plus, setPlus] = useState(false);
  const [liste, setListe] = useState<Liste>(null);
  const [recherche, setRecherche] = useState('');
  const ouvrir = (l: Liste) => { setRecherche(''); setListe(l); };

  const dates = useMemo(() => {
    const out: string[] = [];
    const d = new Date(); d.setDate(d.getDate() - 7);
    for (let i = 0; i < 120; i++) { out.push(toYMD(d)); d.setDate(d.getDate() + 1); }
    if (form.date && !out.includes(form.date)) out.unshift(form.date);
    return out;
  }, [form.date]);

  const chantiers: Option[] = [{ v: '', l: tm('Aucun') }, ...data.chantiers
    .filter(c => c.statut === 'actif' || c.statut === 'sav' || c.id === form.chantierId)
    .sort((a, b) => a.nom.localeCompare(b.nom))
    .map(c => ({ v: c.id, l: c.nom, couleur: c.couleur }))];
  const recurrences: Option[] = [{ v: 'aucune', l: tm('Aucune') }, { v: 'quotidien', l: tm('Quotidien') }, { v: 'hebdomadaire', l: tm('Hebdo') }, { v: 'mensuel', l: tm('Mensuel') }];
  const invitesOptions: Option[] = invitables.map(p => ({ v: p.cle, l: p.nom }));
  const visibleOptions: Option[] = data.employes.filter(e => !form.invites.includes(e.id)).map(e => ({ v: e.id, l: `${e.prenom} ${e.nom.charAt(0)}.` }));

  const multiple = liste === 'invites' || liste === 'visible';
  const estHeure = liste === 'debut' || liste === 'fin';
  const options: Option[] =
    liste === 'date' || liste === 'finRecurrence' ? dates.map(v => ({ v, l: dateCourte(v) }))
      : liste === 'chantier' ? chantiers
            : liste === 'recurrence' ? recurrences
              : liste === 'invites' ? invitesOptions
                : liste === 'visible' ? visibleOptions : [];

  // Saisie qui restreint la liste (chantiers, personnes)
  const avecRecherche = liste === 'chantier' || liste === 'invites' || liste === 'visible';
  const q = recherche.trim().toLowerCase();
  const optionsFiltrees = avecRecherche && q ? options.filter(o => o.v !== '' && o.l.toLowerCase().includes(q)) : options;

  // Heure en cours d'édition (début ou fin) : heures à gauche, minutes à droite
  const heureEditee = liste === 'debut' ? form.heureDebut : liste === 'fin' ? (form.heureFin || form.heureDebut) : '';
  const [hSel, mSel] = heureEditee ? heureEditee.split(':').map(Number) : [9, 0];
  const changerHeure = (h: number, m: number) => {
    const v = hhmm(h * 60 + m);
    if (liste === 'debut') setForm(f => {
      const duree = f.heureFin ? Math.max(15, minutes(f.heureFin) - minutes(f.heureDebut)) : 60;
      return { ...f, heureDebut: v, heureFin: hhmm(Math.min(minutes(v) + duree, 23 * 60 + 45)) };
    });
    // La fin reste toujours après le début (au moins 15 min)
    if (liste === 'fin') setForm(f => ({ ...f, heureFin: minutes(v) > minutes(f.heureDebut) ? v : hhmm(Math.min(minutes(f.heureDebut) + 15, 23 * 60 + 45)) }));
  };

  const estChoisi = (v: string): boolean => {
    switch (liste) {
      case 'date': return v === form.date;
      case 'finRecurrence': return v === form.recurrenceFinDate;
      case 'chantier': return v === form.chantierId;
      case 'recurrence': return v === form.recurrence;
      case 'invites': return form.invites.includes(v);
      case 'visible': return form.visiblePar.includes(v);
      default: return false;
    }
  };

  const choisir = (v: string) => {
    const bascule = (arr: string[]) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
    switch (liste) {
      case 'date': setForm(f => ({ ...f, date: v })); break;
      case 'finRecurrence': setForm(f => ({ ...f, recurrenceFinDate: v })); break;
      case 'chantier': setForm(f => ({ ...f, chantierId: v })); break;
      case 'recurrence': setForm(f => ({ ...f, recurrence: v })); break;
      case 'invites': setForm(f => ({ ...f, invites: bascule(f.invites), visiblePar: f.visiblePar.filter(x => x !== v) })); return;
      case 'visible': setForm(f => ({ ...f, visiblePar: bascule(f.visiblePar) })); return;
    }
    setListe(null);
  };

  const noms = (ids: string[], opts: Option[]) => {
    if (!ids.length) return tm('Personne');
    const n = ids.map(id => opts.find(o => o.v === id)?.l || invitables.find(p => p.cle === id)?.nom || '').filter(Boolean);
    return n.length <= 2 ? n.join(', ') : `${n.slice(0, 2).join(', ')} +${n.length - 2}`;
  };

  const deroulant = (label: string, valeur: string, l: Liste, flex?: number) => (
    <Pressable onPress={() => ouvrir(l)} accessibilityRole="button" accessibilityLabel={label} style={{ flex, gap: 2 }}>
      <Text style={labelStyle}>{label}</Text>
      <View style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46 }]}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#2B1D14' }} numberOfLines={1}>{valeur}</Text>
        <Text style={{ fontSize: 12, color: '#6E5F54' }}>▾</Text>
      </View>
    </Pressable>
  );

  const titreListe: Record<Exclude<Liste, null>, string> = {
    date: tm('Date'), debut: tm('Début'), fin: tm('Fin'), finRecurrence: tm('Fin de récurrence'), chantier: tm('Chantier associé'),
    recurrence: tm('Récurrence'), invites: tm('Invités (participants)'), visible: tm('Visible par (sans être invité)'),
  };

  return (
    <ModalKeyboard visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Fond : un tap ferme ; la feuille est une View pour ne pas gêner le défilement */}
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel={tm('Fermer')} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, maxHeight: '92%' }}>
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

            {deroulant(tm('Date'), dateCourte(form.date), 'date')}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {deroulant(tm('Début'), form.heureDebut, 'debut', 1)}
              {deroulant(tm('Fin'), form.heureFin || '—', 'fin', 1)}
            </View>
            {deroulant(tm('Chantier associé'), chantiers.find(c => c.v === form.chantierId)?.l || tm('Aucun'), 'chantier')}

            <Text style={labelStyle}>{tm('Couleur')}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
              {COULEURS_RDV.map(c => (
                <Pressable key={c} onPress={() => setForm(f => ({ ...f, couleur: c }))} accessibilityRole="button" accessibilityState={{ selected: form.couleur === c }}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: form.couleur === c ? 3 : 0, borderColor: '#2B1D14' }} />
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
                {deroulant(tm('Récurrence'), recurrences.find(r => r.v === form.recurrence)?.l || tm('Aucune'), 'recurrence')}
                {form.recurrence !== 'aucune' && deroulant(tm('Fin de récurrence'), form.recurrenceFinDate ? dateCourte(form.recurrenceFinDate) : tm('Sélectionner...'), 'finRecurrence')}
                {deroulant(tm('Invités (participants)'), noms(form.invites, invitesOptions), 'invites')}
                {deroulant(tm('Visible par (sans être invité)'), noms(form.visiblePar, visibleOptions), 'visible')}
              </>
            )}

            <Pressable style={{ marginTop: 12, backgroundColor: '#5C1F2E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: form.titre.trim() ? 1 : 0.5 }}
              onPress={onSave} disabled={!form.titre.trim()} accessibilityRole="button">
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editId ? tm('Enregistrer') : tm('Créer le rendez-vous')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      {/* Liste déroulante (choix simple : se ferme ; choix multiple : cases à cocher + OK) */}
      <Modal visible={!!liste} transparent animationType="fade" onRequestClose={() => setListe(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setListe(null)} />
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 8, width: '100%', maxWidth: 360, maxHeight: '75%' }}>
            {!!liste && <Text style={{ fontSize: 14, fontWeight: '800', color: '#5C1F2E', paddingHorizontal: 12, paddingVertical: 8 }}>{titreListe[liste]}{estHeure ? ` · ${heureEditee}` : ''}</Text>}
            {avecRecherche && (
              <TextInput value={recherche} onChangeText={setRecherche} placeholder={liste === 'chantier' ? tm('Rechercher un chantier') : tm('Rechercher')}
                placeholderTextColor="#9A8C80" autoCorrect={false} clearButtonMode="while-editing"
                style={[inputStyle, { marginHorizontal: 4, marginBottom: 6, fontSize: 15 }]} />
            )}
            {estHeure ? (
              <View style={{ flexDirection: 'row', gap: 8, height: LIGNE * 5 }}>
                {/* Heures */}
                <ScrollView style={{ flex: 1 }} contentOffset={{ x: 0, y: Math.max(0, (HEURES_H.indexOf(hSel) - 2) * LIGNE) }} showsVerticalScrollIndicator={false}>
                  {HEURES_H.map(h => {
                    const actif = h === hSel;
                    return (
                      <Pressable key={h} onPress={() => changerHeure(h, mSel)} accessibilityRole="button" accessibilityState={{ selected: actif }}
                        style={{ height: LIGNE, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: actif ? '#5C1F2E' : undefined }}>
                        <Text style={{ fontSize: 20, fontWeight: actif ? '800' : '500', color: actif ? '#fff' : '#2B1D14' }}>{String(h).padStart(2, '0')} h</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {/* Minutes (tranches de 15) */}
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  {MINUTES_Q.map(m => {
                    const actif = m === mSel;
                    return (
                      <Pressable key={m} onPress={() => changerHeure(hSel, m)} accessibilityRole="button" accessibilityState={{ selected: actif }}
                        style={{ height: LIGNE, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: actif ? '#5C1F2E' : undefined }}>
                        <Text style={{ fontSize: 20, fontWeight: actif ? '800' : '500', color: actif ? '#fff' : '#2B1D14' }}>{String(m).padStart(2, '0')}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {optionsFiltrees.map(o => {
                const actif = estChoisi(o.v);
                return (
                  <Pressable key={o.v || '_'} onPress={() => choisir(o.v)} accessibilityRole={multiple ? 'checkbox' : 'button'} accessibilityState={multiple ? { checked: actif } : { selected: actif }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 46, borderRadius: 10, backgroundColor: actif ? '#F2E4E1' : undefined }}>
                    {multiple && (
                      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#5C1F2E', backgroundColor: actif ? '#5C1F2E' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                        {actif && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text>}
                      </View>
                    )}
                    {!!o.couleur && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: o.couleur }} />}
                    <Text style={{ flex: 1, fontSize: 15, color: '#2B1D14', fontWeight: actif ? '800' : '500' }}>{o.l}</Text>
                    {!multiple && actif && <Text style={{ color: '#5C1F2E', fontWeight: '900' }}>✓</Text>}
                  </Pressable>
                );
              })}
              {optionsFiltrees.length === 0 && <Text style={{ padding: 12, color: '#6E5F54' }}>{tm('Aucun')}</Text>}
            </ScrollView>
            )}
            {(multiple || estHeure) && (
              <Pressable onPress={() => setListe(null)} accessibilityRole="button" style={{ marginTop: 6, minHeight: 46, borderRadius: 12, backgroundColor: '#5C1F2E', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>OK</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </ModalKeyboard>
  );
}

const labelStyle = { fontSize: 12, fontWeight: '600' as const, color: '#6E5F54', marginBottom: 2, marginTop: 8 };
const inputStyle = { backgroundColor: '#F1E7DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#EDE2D6' };

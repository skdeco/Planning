import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Plus, Pencil, Trash2, Link2, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react-native';
import type { Prescription, PrescriptionNature, PrescriptionStatut, PrescriptionDocument } from '@/app/types';
import { PRESCRIPTION_STATUT_LABELS } from '@/app/types';
import { useApp } from '@/app/context/AppContext';
import { PanelHeader } from '@/components/ui/PanelHeader';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { openDocPreview } from '@/lib/share/openDocPreview';
import { DS, radius, space, font } from '@/constants/design';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FilterChip } from '@/components/ui/FilterChip';
import { StatusPill, type StatusType } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * PrescriptionsPanel — prescriptions matériaux & déco d'un chantier.
 * Boucle archi → entreprise → client (statut). Palette V10 bordeaux/crème.
 *
 * Panel plein écran (pattern SuiviCRPanel). Le formulaire d'ajout est rendu
 * en overlay inline — jamais en <Modal> imbriquée (fix bug Modal-on-Modal iOS).
 */
export interface PrescriptionsPanelProps {
  visible?: boolean;
  onClose?: () => void;
  chantierId: string;
  /** Auteur des prescriptions créées ('admin' ou apporteurId architecte). */
  auteurId?: string;
  /** Rendu sans Modal (intégré dans un onglet, ex. portail architecte). */
  embedded?: boolean;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Éditeur de liens multiples (une ligne = input + suppression). */
function LinksEditor({ liens, onChange }: { liens: string[]; onChange: (l: string[]) => void }) {
  return (
    <>
      {liens.map((l, i) => (
        <View key={i} style={styles.linkRow}>
          <TextInput
            style={[styles.input, styles.linkInput]} placeholder="https://…" autoCapitalize="none"
            placeholderTextColor={DS.textAlt} value={l}
            onChangeText={t => onChange(liens.map((x, j) => (j === i ? t : x)))}
          />
          <Pressable hitSlop={8} onPress={() => onChange(liens.filter((_, j) => j !== i))} style={styles.miniDel}><X size={16} color={DS.marron} /></Pressable>
        </View>
      ))}
      <Pressable style={styles.addLine} onPress={() => onChange([...liens, ''])}>
        <Link2 size={15} color={DS.bordeaux} /><Text style={styles.addLineText}>Ajouter un lien</Text>
      </Pressable>
    </>
  );
}

/** Éditeur de documents (chips + bouton fichier/photo/caméra). */
function DocsEditor({ docs, onChange, onPick, busy }: { docs: PrescriptionDocument[]; onChange: (d: PrescriptionDocument[]) => void; onPick: () => void; busy: boolean }) {
  return (
    <>
      {docs.length > 0 && (
        <View style={styles.docWrap}>
          {docs.map(d => (
            <View key={d.id} style={styles.docChip}>
              <Pressable style={styles.docChipMain} onPress={() => openDocPreview(d.uri)}>
                {d.type === 'pdf' ? <FileText size={13} color={DS.bordeaux} /> : <ImageIcon size={13} color={DS.bordeaux} />}
                <Text style={styles.docChipText} numberOfLines={1}>{d.nom}</Text>
              </Pressable>
              <Pressable hitSlop={6} onPress={() => onChange(docs.filter(x => x.id !== d.id))}><X size={13} color={DS.marron} /></Pressable>
            </View>
          ))}
        </View>
      )}
      <Pressable style={styles.addLine} onPress={onPick} disabled={busy}>
        {busy ? <ActivityIndicator size="small" color={DS.bordeaux} /> : <Paperclip size={15} color={DS.bordeaux} />}
        <Text style={styles.addLineText}>Ajouter fichier / photo</Text>
      </Pressable>
    </>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

/** Mappe le statut de prescription vers un StatusPill (3 tons DS). */
function statutToPill(statut: PrescriptionStatut): StatusType {
  if (statut === 'valide') return 'actif';
  if (statut === 'commande' || statut === 'pose') return 'livre';
  return 'attente'; // a_proposer, propose, refuse
}

const NATURES: { key: PrescriptionNature; label: string }[] = [
  { key: 'materiau', label: 'Matériau' },
  { key: 'deco', label: 'Décoration' },
];

const STATUTS: PrescriptionStatut[] = [
  'a_proposer', 'propose', 'valide', 'refuse', 'commande', 'pose',
];

type FormState = {
  nature: PrescriptionNature;
  categorie: string;
  designation: string;
  marque: string;
  reference: string;
  liens: string[];
  documents: PrescriptionDocument[];
  ftLiens: string[];
  ftDocuments: PrescriptionDocument[];
  prixUnitaire: string;
  unite: string;
  quantite: string;
  auDevis: boolean;
  montantDevis: string;
  statut: PrescriptionStatut;
};

const EMPTY_FORM: FormState = {
  nature: 'materiau', categorie: '', designation: '', marque: '', reference: '',
  liens: [], documents: [], ftLiens: [], ftDocuments: [],
  prixUnitaire: '', unite: '', quantite: '', auDevis: false, montantDevis: '', statut: 'a_proposer',
};

export function PrescriptionsPanel({ visible, onClose, chantierId, auteurId = 'admin', embedded = false }: PrescriptionsPanelProps) {
  const { data, addPrescription, updatePrescription, deletePrescription } = useApp();

  const [filter, setFilter] = useState<string | null>(null); // null = toutes
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const chantierNom = useMemo(
    () => data.chantiers.find(c => c.id === chantierId)?.nom ?? '',
    [data.chantiers, chantierId],
  );

  const items = useMemo(
    () => (data.prescriptions || []).filter(p => p.chantierId === chantierId),
    [data.prescriptions, chantierId],
  );

  const categories = useMemo(
    () => Array.from(new Set(items.map(i => i.categorie))).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const visibles = useMemo(
    () => (filter === null ? items : items.filter(i => i.categorie === filter)),
    [items, filter],
  );

  // Regroupe par catégorie (ordre alphabétique)
  const groupes = useMemo(() => {
    const map = new Map<string, Prescription[]>();
    for (const p of visibles) {
      const arr = map.get(p.categorie) || [];
      arr.push(p);
      map.set(p.categorie, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibles]);

  const totalCategorie = (list: Prescription[]) =>
    list.reduce((s, p) => s + (p.prixUnitaire || 0) * (p.quantite || 0), 0);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: Prescription) => {
    setEditId(p.id);
    // Migration : l'ancien champ `lien` unique est repris dans `liens`.
    const liens = p.liens && p.liens.length ? [...p.liens] : (p.lien ? [p.lien] : []);
    setForm({
      nature: p.nature,
      categorie: p.categorie,
      designation: p.designation,
      marque: p.marque || '',
      reference: p.reference || '',
      liens,
      documents: p.documents ? [...p.documents] : [],
      ftLiens: p.ficheTechnique?.liens ? [...p.ficheTechnique.liens] : [],
      ftDocuments: p.ficheTechnique?.documents ? [...p.ficheTechnique.documents] : [],
      prixUnitaire: p.prixUnitaire != null ? String(p.prixUnitaire) : '',
      unite: p.unite || '',
      quantite: p.quantite != null ? String(p.quantite) : '',
      auDevis: !!p.auDevis,
      montantDevis: p.montantDevis != null ? String(p.montantDevis) : '',
      statut: p.statut,
    });
    setShowForm(true);
  };

  const save = () => {
    const now = new Date().toISOString();
    const existing = editId ? items.find(i => i.id === editId) : undefined;
    const num = (v: string) => (v.trim() ? parseFloat(v.replace(',', '.')) || undefined : undefined);
    const liens = form.liens.map(l => l.trim()).filter(Boolean);
    const ftLiens = form.ftLiens.map(l => l.trim()).filter(Boolean);
    const ficheTechnique = (ftLiens.length || form.ftDocuments.length)
      ? { liens: ftLiens.length ? ftLiens : undefined, documents: form.ftDocuments.length ? form.ftDocuments : undefined }
      : undefined;
    const entry: Prescription = {
      id: editId || genId('presc'),
      chantierId,
      nature: form.nature,
      categorie: form.categorie.trim() || 'Divers',
      designation: form.designation.trim() || 'Sans titre',
      marque: form.marque.trim() || undefined,
      reference: form.reference.trim() || undefined,
      lien: liens[0],                                   // compat ascendante (1er lien)
      liens: liens.length ? liens : undefined,
      documents: form.documents.length ? form.documents : undefined,
      ficheTechnique,
      prixUnitaire: num(form.prixUnitaire),
      unite: form.unite.trim() || undefined,
      quantite: num(form.quantite),
      auDevis: form.auDevis || undefined,
      montantDevis: form.auDevis ? num(form.montantDevis) : undefined,
      statut: form.statut,
      visibilite: existing?.visibilite,
      alternatives: existing?.alternatives,
      livraisonId: existing?.livraisonId,
      createParId: existing?.createParId || auteurId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (editId) updatePrescription(entry);
    else addPrescription(entry);
    setShowForm(false);
  };

  // Upload de fichiers/photos (caméra incluse) → documents
  const [uploading, setUploading] = useState(false);
  const pickDocs = async (onAdd: (docs: PrescriptionDocument[]) => void) => {
    try {
      const files = await pickNativeFile({ acceptImages: true, acceptPdf: true, acceptCamera: true, multiple: true });
      if (!files.length) return;
      setUploading(true);
      const uploaded: PrescriptionDocument[] = [];
      for (const f of files) {
        const url = await uploadFileToStorage(f.uri, `chantiers/${chantierId}/prescriptions`, genId('pdoc'));
        if (url) uploaded.push({ id: genId('pdoc'), nom: f.filename || 'Document', uri: url, type: f.mimeType?.includes('pdf') ? 'pdf' : 'image' });
      }
      setUploading(false);
      if (uploaded.length) onAdd(uploaded);
      else Alert.alert('Upload', "Le fichier n'a pas pu être envoyé.");
    } catch { setUploading(false); }
  };

  const confirmDelete = (p: Prescription) => {
    Alert.alert('Supprimer', `Supprimer « ${p.designation} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deletePrescription(p.id) },
    ]);
  };

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  const body = (
      <View style={[styles.screen, embedded && styles.embedded]}>
        {/* En-tête (masqué en mode intégré : le portail affiche déjà le contexte) */}
        {!embedded && (
          <PanelHeader title="Prescriptions" sub={chantierNom} onClose={onClose ?? (() => {})} />
        )}

        {/* Filtres par catégorie */}
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="Toutes" active={filter === null} onPress={() => setFilter(null)} activeColor={DS.bordeaux} />
            {categories.map(c => (
              <FilterChip key={c} label={c} active={filter === c} onPress={() => setFilter(c)} activeColor={DS.bordeaux} />
            ))}
          </ScrollView>
        )}

        {/* Liste groupée */}
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {groupes.length === 0 ? (
            <EmptyState iconComponent={Plus} title="Aucune prescription" description="Ajoutez le premier matériau ou élément de décoration." />
          ) : (
            groupes.map(([cat, list]) => (
              <View key={cat} style={styles.groupe}>
                <SectionHeader title={cat} count={list.length} subtitle={`${fmt(totalCategorie(list))} €`} uppercase size="sm" />
                {list.map(p => {
                  const sousTotal = (p.prixUnitaire || 0) * (p.quantite || 0);
                  return (
                    <View key={p.id} style={styles.card}>
                      <View style={styles.cardBody}>
                        <Text style={styles.designation} numberOfLines={1}>{p.designation}</Text>
                        {(p.marque || p.reference) ? (
                          <Text style={styles.marque} numberOfLines={1}>{[p.marque, p.reference].filter(Boolean).join(' · ')}</Text>
                        ) : null}
                        <View style={styles.metaRow}>
                          {p.prixUnitaire != null ? (
                            <Text style={styles.prix}>
                              {fmt(p.prixUnitaire)} €{p.unite ? ` /${p.unite}` : ''}
                              {p.quantite != null && sousTotal ? ` · ${fmt(sousTotal)} €` : ''}
                            </Text>
                          ) : null}
                          {(p.lien || p.liens?.length || p.ficheTechnique?.liens?.length) ? <Link2 size={13} color={DS.textSecondary} /> : null}
                          {(p.documents?.length || p.ficheTechnique?.documents?.length) ? <Paperclip size={13} color={DS.textSecondary} /> : null}
                        </View>
                        <View style={styles.pillRow}>
                          <StatusPill label={PRESCRIPTION_STATUT_LABELS[p.statut]} status={statutToPill(p.statut)} />
                        </View>
                      </View>
                      <View style={styles.actions}>
                        <Pressable hitSlop={8} onPress={() => openEdit(p)} style={styles.actionBtn}>
                          <Pencil size={16} color={DS.bordeaux} />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => confirmDelete(p)} style={styles.actionBtn}>
                          <Trash2 size={16} color={DS.marron} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {/* FAB ajouter */}
        <Pressable style={styles.fab} onPress={openNew}>
          <Plus size={22} color={DS.cremeFond} />
        </Pressable>

        {/* Formulaire ajout/édition — overlay inline (pas de Modal imbriquée) */}
        {showForm && (
          <View style={styles.formOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.formSheet}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formTitle}>{editId ? 'Modifier' : 'Nouvelle prescription'}</Text>

                <View style={styles.segRow}>
                  {NATURES.map(n => (
                    <FilterChip key={n.key} label={n.label} active={form.nature === n.key} onPress={() => set({ nature: n.key })} activeColor={DS.bordeaux} />
                  ))}
                </View>

                <TextInput style={styles.input} placeholder="Catégorie (ex: Carrelage, Luminaires)" placeholderTextColor={DS.textAlt} value={form.categorie} onChangeText={t => set({ categorie: t })} />
                <TextInput style={styles.input} placeholder="Désignation (ex: Grès cérame 60×60 mat)" placeholderTextColor={DS.textAlt} value={form.designation} onChangeText={t => set({ designation: t })} />
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Marque" placeholderTextColor={DS.textAlt} value={form.marque} onChangeText={t => set({ marque: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Référence" placeholderTextColor={DS.textAlt} value={form.reference} onChangeText={t => set({ reference: t })} />
                </View>
                <View style={styles.row2}>
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Prix €" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.prixUnitaire} onChangeText={t => set({ prixUnitaire: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Unité" placeholderTextColor={DS.textAlt} value={form.unite} onChangeText={t => set({ unite: t })} />
                  <TextInput style={[styles.input, styles.flex1]} placeholder="Qté" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.quantite} onChangeText={t => set({ quantite: t })} />
                </View>

                <Pressable style={styles.devisToggle} onPress={() => set({ auDevis: !form.auDevis })}>
                  <View style={[styles.checkbox, form.auDevis && styles.checkboxOn]} />
                  <Text style={styles.devisToggleText}>Prévu au devis (comparer l'écart de prix)</Text>
                </Pressable>
                {form.auDevis && (
                  <TextInput style={styles.input} placeholder="Montant prévu au devis € HT" placeholderTextColor={DS.textAlt} keyboardType="decimal-pad" value={form.montantDevis} onChangeText={t => set({ montantDevis: t })} />
                )}

                <Text style={styles.formLabel}>Références & visuels de l'article</Text>
                <LinksEditor liens={form.liens} onChange={l => set({ liens: l })} />
                <DocsEditor docs={form.documents} onChange={d => set({ documents: d })} onPick={() => pickDocs(docs => set({ documents: [...form.documents, ...docs] }))} busy={uploading} />

                <Text style={styles.formLabel}>Fiche technique</Text>
                <LinksEditor liens={form.ftLiens} onChange={l => set({ ftLiens: l })} />
                <DocsEditor docs={form.ftDocuments} onChange={d => set({ ftDocuments: d })} onPick={() => pickDocs(docs => set({ ftDocuments: [...form.ftDocuments, ...docs] }))} busy={uploading} />

                <Text style={styles.formLabel}>Statut</Text>
                <View style={styles.segWrap}>
                  {STATUTS.map(s => (
                    <FilterChip key={s} label={PRESCRIPTION_STATUT_LABELS[s]} active={form.statut === s} onPress={() => set({ statut: s })} activeColor={DS.bordeaux} />
                  ))}
                </View>

                <Pressable style={styles.saveBtn} onPress={save}>
                  <Text style={styles.saveText}>{editId ? 'Enregistrer' : 'Ajouter'}</Text>
                </Pressable>
              </ScrollView>
            </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
  );
  if (embedded) return body;
  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.cremeFond },
  embedded: { paddingTop: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingTop: space.xxxl, paddingBottom: space.md },
  hTitle: { fontSize: font.xl, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  hSub: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 120 },
  groupe: { marginBottom: space.lg },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border,
    padding: space.md, marginBottom: space.sm,
  },
  cardBody: { flex: 1, minWidth: 0 },
  designation: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  marque: { fontSize: font.compact, color: DS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  prix: { fontSize: font.compact, fontWeight: font.semibold, color: DS.marron },
  pillRow: { marginTop: space.sm, flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: space.sm },
  actionBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  fab: {
    position: 'absolute', right: space.lg, bottom: space.xl,
    width: 52, height: 52, borderRadius: radius.lg, backgroundColor: DS.bordeaux,
    alignItems: 'center', justifyContent: 'center',
  },
  // Formulaire (overlay inline)
  formOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,38,34,0.42)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '88%' },
  formTitle: { fontSize: font.title, fontWeight: font.heavy, color: DS.sombre, marginBottom: space.md, textTransform: 'uppercase' },
  segRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  segWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  input: {
    backgroundColor: DS.surfaceHover, borderWidth: 1, borderColor: DS.border, borderRadius: radius.md,
    paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.md, color: DS.text, marginBottom: space.sm,
  },
  row2: { flexDirection: 'row', gap: space.sm },
  flex1: { flex: 1 },
  formLabel: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginBottom: space.sm, marginTop: space.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  linkInput: { flex: 1 },
  miniDel: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude, marginBottom: space.sm },
  devisToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, marginBottom: space.sm },
  checkbox: { width: 22, height: 22, borderRadius: radius.xs, borderWidth: 1.5, borderColor: DS.border, backgroundColor: DS.surface },
  checkboxOn: { backgroundColor: DS.bordeaux, borderColor: DS.bordeaux },
  devisToggleText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.sombre, flex: 1 },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.sm, marginBottom: space.sm },
  addLineText: { fontSize: font.compact, fontWeight: font.bold, color: DS.bordeaux },
  docWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.xs },
  docChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.cremeNude, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10, maxWidth: '100%' },
  docChipMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  docChipText: { fontSize: font.compact, fontWeight: font.semibold, color: DS.bordeaux, flexShrink: 1 },
  saveBtn: { backgroundColor: DS.bordeaux, borderRadius: radius.xl, paddingVertical: space.md, alignItems: 'center', marginTop: space.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: DS.cremeFond, fontSize: font.md, fontWeight: font.bold },
});

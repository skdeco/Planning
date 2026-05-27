import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal,
  KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { Plus, Calendar, ChevronLeft, Pencil, Trash2, CheckSquare, Square, X } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import type { SuiviCR, CRSection, TaskItem, LotAvancement } from '@/app/types';

/**
 * SuiviCRPanel — Modal de gestion des CR (compte-rendu) d'un chantier.
 * Phase G du brief V10. Remplace l'ancienne modal "Suivi & Notes".
 *
 * Structure d'un CR :
 *   - Date du CR + auteur
 *   - Sections par lot (auto-générées depuis les lots du chantier
 *     via les marchés/suppléments)
 *   - Chaque section : tâches (cases à cocher) + commentaire libre
 *   - Carry-over auto : les tâches non cochées du CR précédent sont
 *     pré-remplies dans le nouveau CR.
 */
export interface SuiviCRPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
  isAdmin: boolean;
  /** Lecture seule (mode client portail) ; admin a true. */
  readOnly?: boolean;
  /** Rendu inline sans Modal RN (pour intégration dans un onglet/page). */
  inline?: boolean;
}

type ViewMode = 'list' | 'edit';

function genId(p: string): string {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateFR(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

export function SuiviCRPanel({ visible, onClose, chantierId, isAdmin, readOnly, inline }: SuiviCRPanelProps) {
  const { data, addSuiviCR, updateSuiviCR, deleteSuiviCR, currentUser } = useApp();

  const chantier = data.chantiers.find(c => c.id === chantierId);
  const allCRs = useMemo(
    () => (data.suivisCR || []).filter(c => c.chantierId === chantierId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [data.suivisCR, chantierId]
  );

  // Lots disponibles = union des lots de tous les marchés et suppléments
  const lotsDisponibles = useMemo(() => {
    const all: LotAvancement[] = [];
    (data.marchesChantier || []).filter(m => m.chantierId === chantierId)
      .forEach(m => (m.avancementCorps || []).forEach(l => all.push(l)));
    (data.supplementsMarche || []).filter(s => s.chantierId === chantierId)
      .forEach(s => (s.avancementCorps || []).forEach(l => all.push(l)));
    return all;
  }, [data.marchesChantier, data.supplementsMarche, chantierId]);

  const [mode, setMode] = useState<ViewMode>('list');
  const [editingCR, setEditingCR] = useState<SuiviCR | null>(null);

  // Reset à chaque ouverture
  React.useEffect(() => {
    if (visible) {
      setMode('list');
      setEditingCR(null);
    }
  }, [visible]);

  // ── Création d'un nouveau CR ──
  const handleNewCR = () => {
    // 1. Sections auto-dérivées depuis les lots du chantier
    const sectionsBase: CRSection[] = lotsDisponibles.map(l => ({
      lotId: l.id,
      titre: l.nom,
      tasks: [],
      commentaire: undefined,
    }));
    // Section "Hors lot" en plus
    sectionsBase.push({ lotId: null, titre: 'Hors lot', tasks: [], commentaire: undefined });

    // 2. Carry-over depuis le dernier CR (tâches non cochées par section)
    const lastCR = allCRs[0]; // déjà trié date desc
    if (lastCR) {
      for (const section of sectionsBase) {
        const oldSection = lastCR.sections.find(s => s.lotId === section.lotId);
        if (!oldSection) continue;
        const carryTasks = (oldSection.tasks || []).filter(t => !t.fait).map(t => ({
          id: genId('task'),
          texte: t.texte,
          fait: false,
        }));
        section.tasks = carryTasks;
      }
    }

    // 3. Nouveau CR brouillon
    const newCR: SuiviCR = {
      id: genId('cr'),
      chantierId,
      date: todayYMD(),
      auteurId: currentUser?.employeId || currentUser?.apporteurId || currentUser?.soustraitantId || currentUser?.role || 'admin',
      auteurNom: currentUser?.nom || currentUser?.role || 'Admin',
      personnesPresentes: [],
      travauxRealises: '',
      sections: sectionsBase,
      rdvProchains: [],
      statut: 'brouillon',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingCR(newCR);
    setMode('edit');
  };

  const handleOpenCR = (cr: SuiviCR) => {
    setEditingCR(cr);
    setMode('edit');
  };

  const handleSaveCR = (cr: SuiviCR) => {
    const existing = allCRs.find(c => c.id === cr.id);
    if (existing) {
      updateSuiviCR({ ...cr, updatedAt: new Date().toISOString() });
    } else {
      addSuiviCR(cr);
    }
    setMode('list');
    setEditingCR(null);
  };

  const handleDeleteCR = (cr: SuiviCR) => {
    const doDel = () => { deleteSuiviCR(cr.id); setMode('list'); setEditingCR(null); };
    const msg = `Supprimer ce CR du ${formatDateFR(cr.date)} ?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) doDel();
    } else {
      Alert.alert('Supprimer le CR', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDel },
      ]);
    }
  };

  const content = (
    <>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {mode === 'edit' && (
            <Pressable onPress={() => { setMode('list'); setEditingCR(null); }} style={styles.backBtn}>
              <ChevronLeft size={18} color={DS.bordeaux} strokeWidth={2.2} />
            </Pressable>
          )}
          <View>
            <Text style={styles.title}>📋 Suivis CR</Text>
            <Text style={styles.subtitle}>{chantier?.nom || ''}</Text>
          </View>
        </View>
        {!inline && (
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={DS.textSecondary} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>

      {/* Body */}
            {mode === 'list' ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
                {allCRs.length === 0 ? (
                  <Text style={styles.empty}>
                    Aucun CR pour ce chantier.{'\n'}
                    {isAdmin && !readOnly ? 'Crée le premier en cliquant sur "+ Nouveau CR" ci-dessous.' : ''}
                  </Text>
                ) : (
                  allCRs.map(cr => (
                    <Pressable key={cr.id} onPress={() => handleOpenCR(cr)} style={styles.crCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Calendar size={14} color={DS.bordeaux} strokeWidth={2.2} />
                        <Text style={styles.crDate}>{formatDateFR(cr.date)}</Text>
                        {cr.statut === 'brouillon' && (
                          <View style={styles.draftBadge}>
                            <Text style={styles.draftBadgeText}>Brouillon</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.crAuteur}>par {cr.auteurNom}</Text>
                      <Text style={styles.crStats}>
                        {cr.sections.length} section{cr.sections.length > 1 ? 's' : ''} · {cr.sections.reduce((s, sec) => s + sec.tasks.length, 0)} tâche{cr.sections.reduce((s, sec) => s + sec.tasks.length, 0) > 1 ? 's' : ''}
                        {cr.personnesPresentes.length > 0 ? ` · ${cr.personnesPresentes.length} présent${cr.personnesPresentes.length > 1 ? 's' : ''}` : ''}
                      </Text>
                    </Pressable>
                  ))
                )}
                {isAdmin && !readOnly && (
                  <Pressable onPress={handleNewCR} style={styles.newBtn}>
                    <Plus size={16} color={DS.cremeFond} strokeWidth={2.5} />
                    <Text style={styles.newBtnText}>Nouveau CR</Text>
                  </Pressable>
                )}
              </ScrollView>
            ) : editingCR ? (
              <CRForm
                cr={editingCR}
                isAdmin={isAdmin}
                readOnly={readOnly}
                onSave={handleSaveCR}
                onDelete={isAdmin && !readOnly ? handleDeleteCR : undefined}
                onCancel={() => { setMode('list'); setEditingCR(null); }}
              />
            ) : null}
    </>
  );

  if (inline) {
    return <View style={{ flex: 1, backgroundColor: DS.cremeFond }}>{content}</View>;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.overlay}>
          <Pressable style={{ height: '6%' }} onPress={onClose} />
          <View style={styles.sheet}>
            {content}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Formulaire d'édition d'un CR ─────────────────────────────────────────

interface CRFormProps {
  cr: SuiviCR;
  isAdmin: boolean;
  readOnly?: boolean;
  onSave: (cr: SuiviCR) => void;
  onDelete?: (cr: SuiviCR) => void;
  onCancel: () => void;
}

function CRForm({ cr, isAdmin, readOnly, onSave, onDelete, onCancel: _onCancel }: CRFormProps) {
  const [draft, setDraft] = useState<SuiviCR>(cr);
  const ro: boolean = !isAdmin || !!readOnly;

  const updateSection = (idx: number, patch: Partial<CRSection>) => {
    setDraft(prev => ({ ...prev, sections: prev.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
  };

  const addTask = (sectionIdx: number, texte: string) => {
    if (!texte.trim()) return;
    const newTask: TaskItem = { id: genId('task'), texte: texte.trim(), fait: false };
    setDraft(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, tasks: [...s.tasks, newTask] }
        : s),
    }));
  };

  const toggleTask = (sectionIdx: number, taskId: string) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, tasks: s.tasks.map(t => t.id === taskId ? { ...t, fait: !t.fait, faitAt: !t.fait ? new Date().toISOString() : undefined } : t) }
        : s),
    }));
  };

  const removeTask = (sectionIdx: number, taskId: string) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, tasks: s.tasks.filter(t => t.id !== taskId) }
        : s),
    }));
  };

  const handleFinaliser = () => {
    onSave({ ...draft, statut: 'finalise' });
  };
  const handleSaveBrouillon = () => {
    onSave({ ...draft, statut: 'brouillon' });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {/* Date + Statut */}
      <View style={styles.formRow}>
        <Text style={styles.fieldLabel}>Date du CR</Text>
        <TextInput
          style={styles.dateInput}
          value={draft.date}
          onChangeText={v => setDraft(p => ({ ...p, date: v }))}
          placeholder="YYYY-MM-DD"
          editable={!ro}
        />
      </View>

      {/* Travaux réalisés */}
      <Text style={styles.fieldLabel}>Travaux réalisés</Text>
      <TextInput
        style={[styles.textarea, ro && styles.readOnly]}
        value={draft.travauxRealises || ''}
        onChangeText={v => setDraft(p => ({ ...p, travauxRealises: v }))}
        placeholder="Description des travaux du jour…"
        placeholderTextColor={DS.textSecondary}
        multiline
        editable={!ro}
      />

      {/* Sections par lot */}
      <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Sections par lot</Text>
      {draft.sections.length === 0 ? (
        <Text style={styles.empty}>Aucun lot disponible. Ajoute des lots dans Marchés pour générer les sections.</Text>
      ) : (
        draft.sections.map((section, idx) => (
          <CRSectionView
            key={`${section.lotId || 'horslot'}-${idx}`}
            section={section}
            ro={ro}
            onChangeCommentaire={v => updateSection(idx, { commentaire: v })}
            onAddTask={t => addTask(idx, t)}
            onToggleTask={tid => toggleTask(idx, tid)}
            onRemoveTask={tid => removeTask(idx, tid)}
          />
        ))
      )}

      {/* Actions */}
      {!ro && (
        <View style={styles.formActions}>
          {onDelete && draft.id && (
            <Pressable onPress={() => onDelete(draft)} style={styles.deleteBtn}>
              <Trash2 size={14} color="#E74C3C" strokeWidth={2.2} />
              <Text style={styles.deleteBtnText}>Supprimer</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable onPress={handleSaveBrouillon} style={styles.draftBtn}>
            <Text style={styles.draftBtnText}>Enregistrer brouillon</Text>
          </Pressable>
          <Pressable onPress={handleFinaliser} style={styles.finalizeBtn}>
            <Text style={styles.finalizeBtnText}>Finaliser</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Section individuelle dans le formulaire ──────────────────────────────

interface CRSectionViewProps {
  section: CRSection;
  ro: boolean;
  onChangeCommentaire: (v: string) => void;
  onAddTask: (texte: string) => void;
  onToggleTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
}

function CRSectionView({ section, ro, onChangeCommentaire, onAddTask, onToggleTask, onRemoveTask }: CRSectionViewProps) {
  const [newTask, setNewTask] = useState('');
  const submitTask = () => { onAddTask(newTask); setNewTask(''); };
  const cochees = section.tasks.filter(t => t.fait).length;

  return (
    <View style={styles.sectionCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.sectionTitle}>{section.titre}</Text>
        {section.tasks.length > 0 && (
          <Text style={styles.sectionStats}>{cochees}/{section.tasks.length}</Text>
        )}
      </View>

      {/* Tasks */}
      {section.tasks.map(t => (
        <View key={t.id} style={styles.taskRow}>
          <Pressable onPress={() => !ro && onToggleTask(t.id)} style={styles.taskCheckbox}>
            {t.fait
              ? <CheckSquare size={18} color={DS.bordeaux} strokeWidth={2.2} />
              : <Square size={18} color={DS.textSecondary} strokeWidth={2.2} />}
          </Pressable>
          <Text style={[styles.taskText, t.fait && styles.taskTextDone]}>{t.texte}</Text>
          {!ro && (
            <Pressable onPress={() => onRemoveTask(t.id)} style={{ padding: 4 }}>
              <X size={14} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
          )}
        </View>
      ))}

      {/* Ajouter une tâche */}
      {!ro && (
        <View style={styles.newTaskRow}>
          <TextInput
            style={styles.newTaskInput}
            value={newTask}
            onChangeText={setNewTask}
            placeholder="+ Ajouter une tâche"
            placeholderTextColor={DS.textSecondary}
            onSubmitEditing={submitTask}
            returnKeyType="done"
          />
          {newTask.trim().length > 0 && (
            <Pressable onPress={submitTask} style={styles.newTaskBtn}>
              <Plus size={14} color={DS.cremeFond} strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      )}

      {/* Commentaire de section */}
      {(section.commentaire || !ro) && (
        <TextInput
          style={[styles.sectionComment, ro && styles.readOnly]}
          value={section.commentaire || ''}
          onChangeText={onChangeCommentaire}
          placeholder="Commentaire libre sur cette section…"
          placeholderTextColor={DS.textSecondary}
          multiline
          editable={!ro}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    flex: 1,
    backgroundColor: DS.cremeFond,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: DS.border,
    gap: 6,
  },
  backBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: DS.cremeNude,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: DS.cremeNude,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: DS.sombre },
  subtitle: { fontSize: 11, color: DS.textSecondary, marginTop: 1 },
  empty: {
    fontSize: 12,
    color: DS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 24,
  },
  crCard: {
    backgroundColor: DS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: DS.border,
    gap: 3,
  },
  crDate: { fontSize: 13, fontWeight: '700', color: DS.sombre },
  crAuteur: { fontSize: 11, color: DS.textSecondary },
  crStats: { fontSize: 10, color: DS.textSecondary, marginTop: 2 },
  draftBadge: {
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  draftBadgeText: { fontSize: 9, color: '#856404', fontWeight: '700' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: DS.bordeaux,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  newBtnText: { color: DS.cremeFond, fontSize: 13, fontWeight: '700' },
  // Form
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: DS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    marginBottom: 4,
  },
  dateInput: {
    backgroundColor: DS.surface,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: DS.sombre,
    minWidth: 140,
  },
  textarea: {
    backgroundColor: DS.surface,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: DS.sombre,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  readOnly: { backgroundColor: DS.cremeNude },
  sectionCard: {
    backgroundColor: DS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: DS.border,
    gap: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: DS.bordeaux, flex: 1 },
  sectionStats: { fontSize: 11, fontWeight: '600', color: DS.textSecondary },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  taskCheckbox: { padding: 2 },
  taskText: { flex: 1, fontSize: 13, color: DS.sombre },
  taskTextDone: { textDecorationLine: 'line-through', color: DS.textSecondary },
  newTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  newTaskInput: {
    flex: 1,
    backgroundColor: DS.cremeNude,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: DS.sombre,
  },
  newTaskBtn: {
    backgroundColor: DS.bordeaux,
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionComment: {
    backgroundColor: DS.cremeNude,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: DS.sombre,
    minHeight: 36,
    marginTop: 4,
    fontStyle: 'italic',
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  deleteBtnText: { color: '#E74C3C', fontSize: 11, fontWeight: '700' },
  draftBtn: {
    backgroundColor: DS.cremeNude,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  draftBtnText: { color: DS.bordeaux, fontSize: 11, fontWeight: '700' },
  finalizeBtn: {
    backgroundColor: DS.bordeaux,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  finalizeBtnText: { color: DS.cremeFond, fontSize: 12, fontWeight: '700' },
  // Pencil import unused warning fix
  _pencil: { width: 1 },
});

// Suppress unused Pencil import warning
void Pencil;

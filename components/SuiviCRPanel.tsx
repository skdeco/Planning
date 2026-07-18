import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal,
  KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import {
  Plus, Calendar, ChevronLeft, Trash2, CheckSquare, Square, X,
  Users, Paperclip, FileText, Image as ImageIcon, Clock,
} from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS } from '@/constants/design';
import type {
  SuiviCR, CRSection, CRSubSection, CRItem, CRTaskItem, CRTexteItem,
  CRPersonnePresente, LotAvancement, RDVChantier, CRAttachment,
} from '@/app/types';
import { sendPushNotification } from '@/hooks/useNotifications';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { openDocPreview } from '@/lib/share/openDocPreview';

export interface SuiviCRPanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
  isAdmin: boolean;
  readOnly?: boolean;
  inline?: boolean;
}

type ViewMode = 'list' | 'editCR' | 'editRDV';

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
/** Normalise une éventuelle pièce jointe legacy (champ unique) en tête du tableau. */
function legacyMerge(arr: CRAttachment[] | undefined, legacyUri?: string, legacyNom?: string): CRAttachment[] {
  return [
    ...(legacyUri ? [{ uri: legacyUri, nom: legacyNom }] : []),
    ...(arr || []),
  ];
}

export function SuiviCRPanel({ visible, onClose, chantierId, isAdmin, readOnly, inline }: SuiviCRPanelProps) {
  const {
    data, addSuiviCR, updateSuiviCR, deleteSuiviCR,
    addRDVChantier, updateRDVChantier, deleteRDVChantier,
    currentUser,
  } = useApp();

  const chantier = data.chantiers.find(c => c.id === chantierId);
  const allCRs = useMemo(
    // En lecture seule (externes), on ne montre que les CR finalisés : pas de brouillons internes.
    () => (data.suivisCR || []).filter(c => c.chantierId === chantierId && (!readOnly || c.statut === 'finalise')),
    [data.suivisCR, chantierId, readOnly]
  );
  const allRDVs = useMemo(
    () => (data.rdvsChantier || []).filter(r => r.chantierId === chantierId),
    [data.rdvsChantier, chantierId]
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

  // ── Intercalation chronologique CR + RDV pour la liste ──
  type TimelineItem =
    | { kind: 'cr'; date: string; cr: SuiviCR }
    | { kind: 'rdv'; date: string; rdv: RDVChantier };
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    allCRs.forEach(cr => items.push({ kind: 'cr', date: cr.date, cr }));
    allRDVs.forEach(r => items.push({ kind: 'rdv', date: r.dateISO, rdv: r }));
    // Tri par date de création décroissante : le dernier CR/RDV créé reste
    // toujours en haut de la liste (indépendamment de la date saisie).
    const createdAtOf = (it: TimelineItem) => it.kind === 'cr' ? it.cr.createdAt : it.rdv.createdAt;
    items.sort((a, b) => (createdAtOf(b) || '').localeCompare(createdAtOf(a) || ''));
    return items;
  }, [allCRs, allRDVs]);

  const [mode, setMode] = useState<ViewMode>('list');
  const [editingCR, setEditingCR] = useState<SuiviCR | null>(null);
  const [editingRDV, setEditingRDV] = useState<RDVChantier | null>(null);

  React.useEffect(() => {
    if (visible) { setMode('list'); setEditingCR(null); setEditingRDV(null); }
  }, [visible]);

  // ── Création d'un nouveau CR ──
  const handleNewCR = () => {
    // 1. Sections auto-dérivées depuis les lots
    const sectionsBase: CRSection[] = lotsDisponibles.map(l => ({
      lotId: l.id, titre: l.nom, subSections: [],
    }));
    sectionsBase.push({ lotId: null, titre: 'Hors lot', subSections: [] });

    // 2. Carry-over depuis le dernier CR (sub-sections avec tâches non cochées)
    const lastCR = allCRs.length > 0
      ? [...allCRs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      : null;
    if (lastCR) {
      for (const section of sectionsBase) {
        const oldSection = lastCR.sections.find(s => s.lotId === section.lotId);
        if (!oldSection) continue;
        const carrySubs: CRSubSection[] = [];
        for (const sub of oldSection.subSections || []) {
          // Filtre les items : on garde uniquement les tâches non cochées
          const carryItems: CRItem[] = (sub.items || [])
            .filter(it => it.kind === 'task' && !it.task.fait)
            .map(it => ({
              kind: 'task' as const,
              task: { id: genId('task'), texte: it.kind === 'task' ? it.task.texte : '', fait: false } as CRTaskItem,
            }));
          if (carryItems.length > 0) {
            carrySubs.push({ id: genId('sub'), titre: sub.titre, items: carryItems });
          }
        }
        section.subSections = carrySubs;
      }
    }

    const newCR: SuiviCR = {
      id: genId('cr'),
      chantierId,
      date: todayYMD(),
      auteurId: currentUser?.employeId || currentUser?.apporteurId || currentUser?.soustraitantId || currentUser?.role || 'admin',
      auteurNom: currentUser?.nom || currentUser?.role || 'Admin',
      personnesPresentes: [],
      sections: sectionsBase,
      statut: 'brouillon',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingCR(newCR);
    setMode('editCR');
  };

  const handleOpenCR = (cr: SuiviCR) => { setEditingCR(cr); setMode('editCR'); };
  const handleSaveCR = (cr: SuiviCR) => {
    const existing = allCRs.find(c => c.id === cr.id);
    if (existing) updateSuiviCR({ ...cr, updatedAt: new Date().toISOString() });
    else addSuiviCR(cr);
    setMode('list'); setEditingCR(null);
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

  // ── RDV ──
  const handleNewRDV = () => {
    const newRDV: RDVChantier = {
      id: genId('rdv'),
      chantierId,
      dateISO: todayYMD(),
      heure: '',
      libelle: '',
      invitesIds: [],
      notifiee: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      auteurId: currentUser?.employeId || currentUser?.apporteurId || currentUser?.role || 'admin',
      auteurNom: currentUser?.nom || currentUser?.role || 'Admin',
    };
    setEditingRDV(newRDV);
    setMode('editRDV');
  };
  const handleOpenRDV = (rdv: RDVChantier) => { setEditingRDV(rdv); setMode('editRDV'); };
  const handleSaveRDV = (rdv: RDVChantier) => {
    const existing = allRDVs.find(r => r.id === rdv.id);
    if (existing) updateRDVChantier({ ...rdv, updatedAt: new Date().toISOString() });
    else {
      addRDVChantier(rdv);
      // Push notif aux invités (uniquement à la création)
      sendRDVNotif(rdv);
    }
    setMode('list'); setEditingRDV(null);
  };
  const handleDeleteRDV = (rdv: RDVChantier) => {
    const doDel = () => { deleteRDVChantier(rdv.id); setMode('list'); setEditingRDV(null); };
    const msg = `Supprimer ce RDV "${rdv.libelle}" ?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) doDel();
    } else {
      Alert.alert('Supprimer le RDV', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDel },
      ]);
    }
  };
  const sendRDVNotif = (rdv: RDVChantier) => {
    const allPersons = [
      ...(data.employes || []).map(e => ({ id: e.id, pushToken: e.pushToken })),
      ...(data.sousTraitants || []).map(s => ({ id: s.id, pushToken: s.pushToken })),
      ...(data.apporteurs || []).map(a => ({ id: a.id, pushToken: a.pushToken })),
    ];
    const tokens = rdv.invitesIds
      .map(id => allPersons.find(p => p.id === id)?.pushToken)
      .filter((t): t is string => !!t);
    if (tokens.length === 0) return;
    sendPushNotification(
      tokens,
      `📅 Nouveau RDV chantier — ${rdv.libelle}`,
      `${chantier?.nom || ''} · ${formatDateFR(rdv.dateISO)}${rdv.heure ? ' à ' + rdv.heure : ''}`,
      { type: 'rdv_chantier', chantierId, rdvId: rdv.id }
    );
  };

  // ── Render ──
  const content = (
    <>
      <View style={styles.header}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {(mode === 'editCR' || mode === 'editRDV') && (
            <Pressable onPress={() => { setMode('list'); setEditingCR(null); setEditingRDV(null); }} style={styles.backBtn}>
              <ChevronLeft size={18} color={DS.bordeaux} strokeWidth={2.2} />
            </Pressable>
          )}
          <View>
            <Text style={styles.title}>Suivis CR</Text>
            <Text style={styles.subtitle}>{chantier?.nom || ''}</Text>
          </View>
        </View>
        {!inline && (
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <X size={20} color={DS.textSecondary} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>

      {mode === 'list' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          {timeline.length === 0 ? (
            <Text style={styles.empty}>
              Aucun CR ni RDV pour ce chantier.{'\n'}
              {isAdmin && !readOnly ? 'Crée le premier avec les boutons ci-dessous.' : ''}
            </Text>
          ) : (
            timeline.map(item => item.kind === 'cr' ? (
              <Pressable key={`cr-${item.cr.id}`} onPress={() => handleOpenCR(item.cr)} style={styles.crCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Calendar size={14} color={DS.bordeaux} strokeWidth={2.2} />
                  <Text style={styles.crDate}>{formatDateFR(item.cr.date)}</Text>
                  {item.cr.statut === 'brouillon' && (
                    <View style={styles.draftBadge}><Text style={styles.draftBadgeText}>Brouillon</Text></View>
                  )}
                </View>
                <Text style={styles.crAuteur}>CR par {item.cr.auteurNom}</Text>
                {(() => {
                  const totalTasks = item.cr.sections.reduce((s, sec) =>
                    s + (sec.subSections || []).reduce((ss, sub) => ss + (sub.items || []).filter(i => i.kind === 'task').length, 0), 0);
                  return totalTasks > 0 ? (
                    <Text style={styles.crStats}>{totalTasks} tâche{totalTasks > 1 ? 's' : ''}</Text>
                  ) : null;
                })()}
              </Pressable>
            ) : (
              <Pressable
                key={`rdv-${item.rdv.id}`}
                onPress={() => isAdmin && !readOnly ? handleOpenRDV(item.rdv) : undefined}
                style={styles.rdvCardTimeline}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Clock size={14} color={DS.marron} strokeWidth={2.2} />
                  <Text style={styles.rdvDate}>
                    {formatDateFR(item.rdv.dateISO)}{item.rdv.heure ? ` · ${item.rdv.heure}` : ''}
                  </Text>
                  <View style={styles.rdvBadge}><Text style={styles.rdvBadgeText}>RDV</Text></View>
                </View>
                <Text style={styles.rdvLibelleTL}>{item.rdv.libelle || '(sans libellé)'}</Text>
                {item.rdv.invitesIds.length > 0 && (
                  <Text style={styles.crStats}>{item.rdv.invitesIds.length} invité{item.rdv.invitesIds.length > 1 ? 's' : ''}</Text>
                )}
              </Pressable>
            ))
          )}
          {isAdmin && !readOnly && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable onPress={handleNewCR} style={[styles.newBtn, { flex: 1 }]}>
                <Plus size={14} color={DS.cremeFond} strokeWidth={2.5} />
                <Text style={styles.newBtnText}>Nouveau CR</Text>
              </Pressable>
              <Pressable onPress={handleNewRDV} style={[styles.newRDVBtn, { flex: 1 }]}>
                <Clock size={14} color={DS.cremeFond} strokeWidth={2.5} />
                <Text style={styles.newBtnText}>Nouveau RDV</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      ) : mode === 'editCR' && editingCR ? (
        <CRForm
          cr={editingCR}
          isAdmin={isAdmin}
          readOnly={readOnly}
          chantierId={chantierId}
          onSave={handleSaveCR}
          onDelete={isAdmin && !readOnly ? handleDeleteCR : undefined}
          onCancel={() => { setMode('list'); setEditingCR(null); }}
        />
      ) : mode === 'editRDV' && editingRDV ? (
        <RDVForm
          rdv={editingRDV}
          isAdmin={isAdmin}
          readOnly={readOnly}
          onSave={handleSaveRDV}
          onDelete={isAdmin && !readOnly ? handleDeleteRDV : undefined}
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
          <View style={styles.sheet}>{content}</View>
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
  chantierId: string;
  onSave: (cr: SuiviCR) => void;
  onDelete?: (cr: SuiviCR) => void;
  onCancel: () => void;
}

function CRForm({ cr, isAdmin, readOnly, chantierId, onSave, onDelete, onCancel: _onCancel }: CRFormProps) {
  const { data } = useApp();
  const [draft, setDraft] = useState<SuiviCR>(cr);
  const chantier = data.chantiers.find(c => c.id === chantierId);
  // 3 niveaux de droits :
  //   - ro (client side ou explicite) : pas d'édition du tout (pas même les cases)
  //   - finalise (admin sur CR finalisé) : seules les checkboxes restent cliquables
  //   - edit : édition complète (admin sur brouillon)
  const fullRO: boolean = !isAdmin || !!readOnly;
  const finalise: boolean = !fullRO && draft.statut === 'finalise';
  // L'admin peut TOUJOURS modifier son CR (même finalisé) — demande Kevin. Seul l'externe
  // (fullRO) est en lecture seule. `finalise` ne sert plus qu'à masquer le bouton "Finaliser".
  const ro: boolean = fullRO;
  // allowToggle = peut cocher les cases ? Admin partout sauf si explicitement readOnly.
  const allowToggle: boolean = !fullRO;
  const [showPersonnesPicker, setShowPersonnesPicker] = useState(false);

  // Personnes disponibles catégorisées
  //  - Clients : SEULEMENT le client lié au chantier (chantier.clientApporteurId)
  //  - Architectes : SEULEMENT l'architecte lié au chantier (chantier.architecteId)
  //  - Autres : apporteurs d'affaires + contractants (label générique "Autres")
  const candidatsClients = useMemo(() => {
    if (!chantier?.clientApporteurId) return [];
    return (data.apporteurs || []).filter(a => a.id === chantier.clientApporteurId);
  }, [data.apporteurs, chantier?.clientApporteurId]);
  const candidatsArchis = useMemo(() => {
    if (!chantier?.architecteId) return [];
    return (data.apporteurs || []).filter(a => a.id === chantier.architecteId);
  }, [data.apporteurs, chantier?.architecteId]);
  const candidatsAutresAp = useMemo(() => (data.apporteurs || []).filter(a => a.type !== 'client' && a.type !== 'architecte'), [data.apporteurs]);

  const togglePersonne = (p: CRPersonnePresente) => {
    setDraft(prev => {
      const exists = prev.personnesPresentes.find(pp => pp.id === p.id);
      return {
        ...prev,
        personnesPresentes: exists
          ? prev.personnesPresentes.filter(pp => pp.id !== p.id)
          : [...prev.personnesPresentes, p],
      };
    });
  };

  // Section manipulation
  const updateSection = (idx: number, patch: Partial<CRSection>) => {
    setDraft(prev => ({ ...prev, sections: prev.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
  };
  const addSubSection = (sectionIdx: number, titre: string) => {
    const newSub: CRSubSection = { id: genId('sub'), titre: titre.trim() || 'Sans titre', items: [] };
    updateSection(sectionIdx, { subSections: [...(draft.sections[sectionIdx].subSections || []), newSub] });
  };
  const updateSubSection = (sectionIdx: number, subIdx: number, patch: Partial<CRSubSection>) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, subSections: (s.subSections || []).map((sub, j) => j === subIdx ? { ...sub, ...patch } : sub) }
        : s),
    }));
  };
  const removeSubSection = (sectionIdx: number, subIdx: number) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, subSections: (s.subSections || []).filter((_, j) => j !== subIdx) }
        : s),
    }));
  };

  const handleFinaliser = () => onSave({ ...draft, statut: 'finalise' });
  const handleSaveBrouillon = () => onSave({ ...draft, statut: 'brouillon' });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {/* Date */}
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

      {/* Personnes présentes */}
      <View style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.fieldLabel}>
            <Users size={11} color={DS.textSecondary} /> Personnes présentes ({draft.personnesPresentes.length})
          </Text>
          {!ro && (
            <Pressable onPress={() => setShowPersonnesPicker(v => !v)} style={styles.chipBtn}>
              <Text style={styles.chipBtnText}>{showPersonnesPicker ? 'Terminer' : '+ Ajouter'}</Text>
            </Pressable>
          )}
        </View>
        {draft.personnesPresentes.length > 0 && (
          <View style={styles.chipsRow}>
            {draft.personnesPresentes.map(p => (
              <View key={p.id} style={styles.chipSelected}>
                <Text style={styles.chipSelectedText}>{fullRO && (p.type === 'employe' || p.type === 'admin') ? 'Équipe SK DECO' : p.nom}</Text>
                {!ro && (
                  <Pressable onPress={() => togglePersonne(p)} style={{ marginLeft: 4 }}>
                    <X size={11} color={DS.cremeFond} strokeWidth={2.5} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
        {showPersonnesPicker && !ro && (
          <CategorizedPicker
            selected={draft.personnesPresentes.map(p => p.id)}
            onToggle={(id, nom, type) => togglePersonne({ id, nom, type })}
            employes={data.employes || []}
            clients={candidatsClients}
            architectes={candidatsArchis}
            autresAp={candidatsAutresAp}
            sousTraitants={data.sousTraitants || []}
          />
        )}
      </View>

      {/* Sections par lot.
          Côté lecture seule (client) : on masque les sections vides
          (aucune sous-section ET aucun commentaire). */}
      <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Sections par lot</Text>
      {(() => {
        const sectionsToShow = fullRO
          ? draft.sections.filter(s =>
              (s.subSections || []).some(sub => (sub.items || []).length > 0)
              || !!(s.commentaire?.trim())
            )
          : draft.sections;
        if (sectionsToShow.length === 0) {
          return (
            <Text style={styles.empty}>
              {fullRO
                ? 'Aucun contenu pour ce CR.'
                : 'Aucun lot disponible. Ajoute des lots dans Marchés pour générer les sections.'}
            </Text>
          );
        }
        return sectionsToShow.map(section => {
          const idx = draft.sections.findIndex(s => s.lotId === section.lotId && s.titre === section.titre);
          return (
            <CRSectionBox
              key={`${section.lotId || 'horslot'}-${idx}`}
              section={section}
              ro={ro}
              allowToggle={allowToggle}
              chantierId={chantierId}
              onChangeCommentaire={v => updateSection(idx, { commentaire: v })}
              onAddSubSection={titre => addSubSection(idx, titre)}
              onUpdateSubSection={(subIdx, patch) => updateSubSection(idx, subIdx, patch)}
              onRemoveSubSection={subIdx => removeSubSection(idx, subIdx)}
            />
          );
        });
      })()}

      {/* Actions — visibles pour l'admin (même sur un CR finalisé, pour
          pouvoir le supprimer). Brouillon/Finaliser uniquement si non finalisé. */}
      {!fullRO && (
        <View style={styles.formActions}>
          {onDelete && draft.id && (
            <Pressable onPress={() => onDelete(draft)} style={styles.deleteBtn}>
              <Trash2 size={14} color="#E74C3C" strokeWidth={2.2} />
              <Text style={styles.deleteBtnText}>Supprimer</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          {!finalise && (
            <>
              <Pressable onPress={handleSaveBrouillon} style={styles.draftBtn}>
                <Text style={styles.draftBtnText}>Enregistrer brouillon</Text>
              </Pressable>
              <Pressable onPress={handleFinaliser} style={styles.finalizeBtn}>
                <Text style={styles.finalizeBtnText}>Finaliser</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Picker catégorisé (Clients / Architectes / Employés / Autres) ────────

interface CategorizedPickerProps {
  selected: string[];
  onToggle: (id: string, nom: string, type: 'employe' | 'soustraitant' | 'apporteur') => void;
  employes: Array<{ id: string; prenom: string; nom: string }>;
  clients: Array<{ id: string; prenom: string; nom: string; societe?: string }>;
  architectes: Array<{ id: string; prenom: string; nom: string; societe?: string }>;
  autresAp: Array<{ id: string; prenom: string; nom: string; societe?: string; type: string }>;
  sousTraitants: Array<{ id: string; prenom: string; nom: string; societe?: string }>;
}

function CategorizedPicker({ selected, onToggle, employes, clients, architectes, autresAp, sousTraitants }: CategorizedPickerProps) {
  const [open, setOpen] = useState<string | null>(null);
  const renderGroup = (key: string, label: string, icon: string, list: Array<{ id: string; prenom: string; nom: string; societe?: string }>, type: 'employe' | 'soustraitant' | 'apporteur') => {
    const isOpen = open === key;
    return (
      <View key={key} style={styles.categoryBox}>
        <Pressable onPress={() => setOpen(isOpen ? null : key)} style={styles.categoryHeader}>
          <Text style={styles.categoryLabel}>{icon} {label} ({list.length})</Text>
          <Text style={styles.categoryToggle}>{isOpen ? '▾' : '▸'}</Text>
        </Pressable>
        {isOpen && (
          <View>
            {list.length === 0 ? (
              <Text style={styles.categoryEmpty}>Aucun {label.toLowerCase()}</Text>
            ) : list.map(p => {
              const nom = `${p.prenom} ${p.nom}${p.societe ? ' — ' + p.societe : ''}`.trim();
              const sel = selected.includes(p.id);
              return (
                <Pressable key={p.id} onPress={() => onToggle(p.id, nom, type)} style={[styles.pickerRow, sel && styles.pickerRowSelected]}>
                  {sel ? <CheckSquare size={14} color={DS.bordeaux} strokeWidth={2.2} /> : <Square size={14} color={DS.textSecondary} strokeWidth={2.2} />}
                  <Text style={styles.pickerRowText}>{nom}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };
  return (
    <View style={styles.pickerBox}>
      {renderGroup('clients', 'Clients', '👤', clients, 'apporteur')}
      {renderGroup('architectes', 'Architectes', '📐', architectes, 'apporteur')}
      {renderGroup('employes', 'Employés', '👷', employes, 'employe')}
      {sousTraitants.length > 0 && renderGroup('st', 'Sous-traitants', '🔧', sousTraitants, 'soustraitant')}
      {autresAp.length > 0 && renderGroup('autres', 'Autres contacts', '🤝', autresAp, 'apporteur')}
    </View>
  );
}

// ─── Section (= lot) avec ses sous-sections par pièce ─────────────────────

interface CRSectionBoxProps {
  section: CRSection;
  ro: boolean;
  allowToggle: boolean;
  chantierId: string;
  onChangeCommentaire: (v: string) => void;
  onAddSubSection: (titre: string) => void;
  onUpdateSubSection: (subIdx: number, patch: Partial<CRSubSection>) => void;
  onRemoveSubSection: (subIdx: number) => void;
}

function CRSectionBox({ section, ro, allowToggle, chantierId, onChangeCommentaire, onAddSubSection, onUpdateSubSection, onRemoveSubSection }: CRSectionBoxProps) {
  const [newSubTitre, setNewSubTitre] = useState('');
  const submitNewSub = () => { onAddSubSection(newSubTitre); setNewSubTitre(''); };

  const totalTasks = (section.subSections || []).reduce((s, sub) => s + (sub.items || []).filter(i => i.kind === 'task').length, 0);
  const doneTasks = (section.subSections || []).reduce((s, sub) => s + (sub.items || []).filter(i => i.kind === 'task' && i.task.fait).length, 0);

  return (
    <View style={styles.sectionCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.sectionTitle}>{section.titre}</Text>
        {totalTasks > 0 && <Text style={styles.sectionStats}>{doneTasks}/{totalTasks}</Text>}
      </View>

      {/* Sous-sections (par pièce) */}
      {(section.subSections || []).map((sub, subIdx) => (
        <CRSubSectionBox
          key={sub.id}
          sub={sub}
          ro={ro}
          allowToggle={allowToggle}
          chantierId={chantierId}
          onUpdate={patch => onUpdateSubSection(subIdx, patch)}
          onRemove={() => onRemoveSubSection(subIdx)}
        />
      ))}

      {/* Ajouter une sous-section */}
      {!ro && (
        <View style={styles.newSubRow}>
          <TextInput
            style={styles.newSubInput}
            value={newSubTitre}
            onChangeText={setNewSubTitre}
            placeholder="+ Titre (ex: Cuisine, Chambre 1)"
            placeholderTextColor={DS.textSecondary}
            onSubmitEditing={submitNewSub}
            returnKeyType="done"
          />
          {newSubTitre.trim().length > 0 && (
            <Pressable onPress={submitNewSub} style={styles.newTaskBtn}>
              <Plus size={14} color={DS.cremeFond} strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      )}

      {/* Commentaire de section (global) */}
      {(section.commentaire || !ro) && (
        <TextInput
          style={[styles.sectionComment, ro && styles.readOnly]}
          value={section.commentaire || ''}
          onChangeText={onChangeCommentaire}
          placeholder="Commentaire libre sur cette section (optionnel)…"
          placeholderTextColor={DS.textSecondary}
          multiline
          editable={!ro}
        />
      )}
    </View>
  );
}

// ─── Sous-section (= pièce / sous-thème) avec ses items mixtes ────────────

interface CRSubSectionBoxProps {
  sub: CRSubSection;
  ro: boolean;
  allowToggle: boolean;
  chantierId: string;
  onUpdate: (patch: Partial<CRSubSection>) => void;
  onRemove: () => void;
}

function CRSubSectionBox({ sub, ro, allowToggle, chantierId, onUpdate, onRemove }: CRSubSectionBoxProps) {
  const [editingTitre, setEditingTitre] = useState(false);
  const [titreDraft, setTitreDraft] = useState(sub.titre);

  // On choisit le type EN PREMIER : un item vide est ajouté, éditable directement.
  const addTask = () => {
    const task: CRTaskItem = { id: genId('task'), texte: '', fait: false };
    onUpdate({ items: [...(sub.items || []), { kind: 'task', task }] });
  };
  const addTexte = () => {
    const texte: CRTexteItem = { id: genId('txt'), texte: '' };
    onUpdate({ items: [...(sub.items || []), { kind: 'texte', texte }] });
  };
  const updateItem = (idx: number, patch: CRItem) => {
    onUpdate({ items: (sub.items || []).map((it, i) => i === idx ? patch : it) });
  };
  const removeItem = (idx: number) => {
    onUpdate({ items: (sub.items || []).filter((_, i) => i !== idx) });
  };

  const handleAttach = async (idx: number, kind: 'photo' | 'pdf') => {
    const files = await pickNativeFile({
      acceptImages: kind === 'photo',
      acceptPdf: kind === 'pdf',
      acceptCamera: kind === 'photo',
      multiple: true,
      compressImages: true,
    });
    if (files.length === 0) return;
    const folder = `chantiers/${chantierId}/cr-items`;
    const uploaded: CRAttachment[] = [];
    for (const f of files) {
      const fileId = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = await uploadFileToStorage(f.uri, folder, fileId);
      if (url) uploaded.push({ uri: url, nom: f.filename });
    }
    if (uploaded.length === 0) return;
    const current = sub.items[idx];
    if (current.kind === 'task') {
      const t = current.task;
      const patch: CRItem = kind === 'photo'
        ? { kind: 'task', task: { ...t, photos: [...legacyMerge(t.photos, t.photoUri, t.photoNom), ...uploaded], photoUri: undefined, photoNom: undefined } }
        : { kind: 'task', task: { ...t, pdfs: [...legacyMerge(t.pdfs, t.pdfUri, t.pdfNom), ...uploaded], pdfUri: undefined, pdfNom: undefined } };
      updateItem(idx, patch);
    } else {
      const tx = current.texte;
      const patch: CRItem = kind === 'photo'
        ? { kind: 'texte', texte: { ...tx, photos: [...legacyMerge(tx.photos, tx.photoUri, tx.photoNom), ...uploaded], photoUri: undefined, photoNom: undefined } }
        : { kind: 'texte', texte: { ...tx, pdfs: [...legacyMerge(tx.pdfs, tx.pdfUri, tx.pdfNom), ...uploaded], pdfUri: undefined, pdfNom: undefined } };
      updateItem(idx, patch);
    }
  };

  return (
    <View style={styles.subSectionCard}>
      <View style={styles.subSectionHeader}>
        {editingTitre && !ro ? (
          <TextInput
            style={styles.subTitreInput}
            value={titreDraft}
            onChangeText={setTitreDraft}
            onBlur={() => { onUpdate({ titre: titreDraft.trim() || sub.titre }); setEditingTitre(false); }}
            autoFocus
          />
        ) : (
          <Pressable onPress={() => !ro && setEditingTitre(true)} style={{ flex: 1 }}>
            <Text style={styles.subTitre}>{sub.titre}</Text>
          </Pressable>
        )}
        {!ro && (
          <Pressable onPress={onRemove} style={{ padding: 4 }}>
            <Trash2 size={12} color="#E74C3C" strokeWidth={2.2} />
          </Pressable>
        )}
      </View>

      {/* Items */}
      {(sub.items || []).map((it, idx) => (
        <CRItemRow
          key={it.kind === 'task' ? it.task.id : it.texte.id}
          item={it}
          ro={ro}
          allowToggle={allowToggle}
          onChange={patch => updateItem(idx, patch)}
          onRemove={() => removeItem(idx)}
          onAttachPhoto={() => handleAttach(idx, 'photo')}
          onAttachPdf={() => handleAttach(idx, 'pdf')}
        />
      ))}

      {/* Ajouter item : on choisit le type, l'item vide apparaît et se remplit directement */}
      {!ro && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <Pressable onPress={addTask} style={styles.addItemBtn}>
            <CheckSquare size={12} color={DS.cremeFond} strokeWidth={2.5} />
            <Text style={styles.addItemBtnText}>Case à cocher</Text>
          </Pressable>
          <Pressable onPress={addTexte} style={[styles.addItemBtn, { backgroundColor: DS.marron }]}>
            <FileText size={12} color={DS.cremeFond} strokeWidth={2.5} />
            <Text style={styles.addItemBtnText}>Texte libre</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Ligne d'item (task ou texte) avec attach photo/PDF ───────────────────

interface CRItemRowProps {
  item: CRItem;
  ro: boolean;
  allowToggle: boolean;
  onChange: (patch: CRItem) => void;
  onRemove: () => void;
  onAttachPhoto: () => void;
  onAttachPdf: () => void;
}

function CRItemRow({ item, ro, allowToggle, onChange, onRemove, onAttachPhoto, onAttachPdf }: CRItemRowProps) {
  if (item.kind === 'task') {
    const t = item.task;
    const toggle = () => onChange({ kind: 'task', task: { ...t, fait: !t.fait, faitAt: !t.fait ? new Date().toISOString() : undefined } });
    const editText = (v: string) => onChange({ kind: 'task', task: { ...t, texte: v } });
    return (
      <View style={styles.itemRow}>
        <Pressable onPress={() => allowToggle && toggle()} style={{ paddingTop: 8 }}>
          {t.fait ? <CheckSquare size={16} color={DS.bordeaux} strokeWidth={2.2} /> : <Square size={16} color={DS.textSecondary} strokeWidth={2.2} />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextInput
            style={[styles.itemText, t.fait && styles.itemTextDone, ro && styles.readOnly]}
            value={t.texte}
            onChangeText={editText}
            editable={!ro}
            placeholder="Écrire la tâche…"
            placeholderTextColor={DS.textSecondary}
            multiline
          />
          {(() => {
            const photoList = legacyMerge(t.photos, t.photoUri, t.photoNom);
            const pdfList = legacyMerge(t.pdfs, t.pdfUri, t.pdfNom);
            if (photoList.length === 0 && pdfList.length === 0) return null;
            const removePhotoAt = (i: number) => onChange({ kind: 'task', task: { ...t, photos: photoList.filter((_, j) => j !== i), photoUri: undefined, photoNom: undefined } });
            const removePdfAt = (i: number) => onChange({ kind: 'task', task: { ...t, pdfs: pdfList.filter((_, j) => j !== i), pdfUri: undefined, pdfNom: undefined } });
            return (
              <View style={styles.attachmentRow}>
                {photoList.map((p, i) => (
                  <View key={`ph-${i}`} style={styles.attachmentItem}>
                    <Pressable onPress={() => openDocPreview(p.uri)}>
                      <Text style={styles.attachmentPdf}>{p.nom || 'Photo'}</Text>
                    </Pressable>
                    {!ro && (
                      <Pressable onPress={() => removePhotoAt(i)} hitSlop={6}>
                        <X size={11} color={DS.textSecondary} strokeWidth={2.2} />
                      </Pressable>
                    )}
                  </View>
                ))}
                {pdfList.map((p, i) => (
                  <View key={`pdf-${i}`} style={styles.attachmentItem}>
                    <Pressable onPress={() => openDocPreview(p.uri)}>
                      <Text style={styles.attachmentPdf}>{p.nom || 'PDF'}</Text>
                    </Pressable>
                    {!ro && (
                      <Pressable onPress={() => removePdfAt(i)} hitSlop={6}>
                        <X size={11} color={DS.textSecondary} strokeWidth={2.2} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
        {!ro && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 2 }}>
            <Pressable onPress={onAttachPhoto} style={styles.iconBtn}>
              <ImageIcon size={12} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
            <Pressable onPress={onAttachPdf} style={styles.iconBtn}>
              <Paperclip size={12} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
            <Pressable onPress={onRemove} style={styles.iconBtn}>
              <X size={12} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>
        )}
      </View>
    );
  } else {
    const txt = item.texte;
    const editText = (v: string) => onChange({ kind: 'texte', texte: { ...txt, texte: v } });
    return (
      <View style={styles.itemRow}>
        <View style={{ paddingTop: 8 }}>
          <FileText size={14} color={DS.marron} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            style={[styles.itemText, { fontStyle: 'italic' }, ro && styles.readOnly]}
            value={txt.texte}
            onChangeText={editText}
            editable={!ro}
            multiline
            placeholder="Texte libre…"
            placeholderTextColor={DS.textSecondary}
          />
          {(() => {
            const photoList = legacyMerge(txt.photos, txt.photoUri, txt.photoNom);
            const pdfList = legacyMerge(txt.pdfs, txt.pdfUri, txt.pdfNom);
            if (photoList.length === 0 && pdfList.length === 0) return null;
            const removePhotoAt = (i: number) => onChange({ kind: 'texte', texte: { ...txt, photos: photoList.filter((_, j) => j !== i), photoUri: undefined, photoNom: undefined } });
            const removePdfAt = (i: number) => onChange({ kind: 'texte', texte: { ...txt, pdfs: pdfList.filter((_, j) => j !== i), pdfUri: undefined, pdfNom: undefined } });
            return (
              <View style={styles.attachmentRow}>
                {photoList.map((p, i) => (
                  <View key={`ph-${i}`} style={styles.attachmentItem}>
                    <Pressable onPress={() => openDocPreview(p.uri)}>
                      <Text style={styles.attachmentPdf}>{p.nom || 'Photo'}</Text>
                    </Pressable>
                    {!ro && (
                      <Pressable onPress={() => removePhotoAt(i)} hitSlop={6}>
                        <X size={11} color={DS.textSecondary} strokeWidth={2.2} />
                      </Pressable>
                    )}
                  </View>
                ))}
                {pdfList.map((p, i) => (
                  <View key={`pdf-${i}`} style={styles.attachmentItem}>
                    <Pressable onPress={() => openDocPreview(p.uri)}>
                      <Text style={styles.attachmentPdf}>{p.nom || 'PDF'}</Text>
                    </Pressable>
                    {!ro && (
                      <Pressable onPress={() => removePdfAt(i)} hitSlop={6}>
                        <X size={11} color={DS.textSecondary} strokeWidth={2.2} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
        {!ro && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 2 }}>
            <Pressable onPress={onAttachPhoto} style={styles.iconBtn}>
              <ImageIcon size={12} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
            <Pressable onPress={onAttachPdf} style={styles.iconBtn}>
              <Paperclip size={12} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
            <Pressable onPress={onRemove} style={styles.iconBtn}>
              <X size={12} color={DS.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>
        )}
      </View>
    );
  }
}

// ─── Formulaire RDV ───────────────────────────────────────────────────────

interface RDVFormProps {
  rdv: RDVChantier;
  isAdmin: boolean;
  readOnly?: boolean;
  onSave: (rdv: RDVChantier) => void;
  onDelete?: (rdv: RDVChantier) => void;
}

function RDVForm({ rdv, isAdmin, readOnly, onSave, onDelete }: RDVFormProps) {
  const { data } = useApp();
  const [draft, setDraft] = useState<RDVChantier>(rdv);
  const chantier = data.chantiers.find(c => c.id === rdv.chantierId);
  const ro: boolean = !isAdmin || !!readOnly;

  // Mêmes règles que CR : clients/archis = uniquement ceux du chantier
  const clients = useMemo(() => {
    if (!chantier?.clientApporteurId) return [];
    return (data.apporteurs || []).filter(a => a.id === chantier.clientApporteurId);
  }, [data.apporteurs, chantier?.clientApporteurId]);
  const archis = useMemo(() => {
    if (!chantier?.architecteId) return [];
    return (data.apporteurs || []).filter(a => a.id === chantier.architecteId);
  }, [data.apporteurs, chantier?.architecteId]);
  const autresAp = useMemo(() => (data.apporteurs || []).filter(a => a.type !== 'client' && a.type !== 'architecte'), [data.apporteurs]);

  const toggleInvite = (id: string) => {
    setDraft(prev => ({
      ...prev,
      invitesIds: prev.invitesIds.includes(id)
        ? prev.invitesIds.filter(i => i !== id)
        : [...prev.invitesIds, id],
    }));
  };

  const canSave = draft.dateISO.trim() && draft.libelle.trim();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { marginBottom: 12 }]}>RDV de chantier</Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput
            style={styles.dateInput}
            value={draft.dateISO}
            onChangeText={v => setDraft(p => ({ ...p, dateISO: v }))}
            placeholder="YYYY-MM-DD"
            editable={!ro}
          />
        </View>
        <View style={{ width: 90 }}>
          <Text style={styles.fieldLabel}>Heure</Text>
          <TextInput
            style={styles.dateInput}
            value={draft.heure || ''}
            onChangeText={v => setDraft(p => ({ ...p, heure: v }))}
            placeholder="HH:MM"
            editable={!ro}
          />
        </View>
      </View>

      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Libellé</Text>
      <TextInput
        style={styles.dateInput}
        value={draft.libelle}
        onChangeText={v => setDraft(p => ({ ...p, libelle: v }))}
        placeholder="ex: RDV avec architecte, Livraison cuisine"
        editable={!ro}
      />

      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Invités ({draft.invitesIds.length})</Text>
      <CategorizedPicker
        selected={draft.invitesIds}
        onToggle={(id) => toggleInvite(id)}
        employes={data.employes || []}
        clients={clients}
        architectes={archis}
        autresAp={autresAp}
        sousTraitants={data.sousTraitants || []}
      />

      {!ro && (
        <View style={styles.formActions}>
          {onDelete && (
            <Pressable onPress={() => onDelete(draft)} style={styles.deleteBtn}>
              <Trash2 size={14} color="#E74C3C" strokeWidth={2.2} />
              <Text style={styles.deleteBtnText}>Supprimer</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => canSave && onSave(draft)} disabled={!canSave} style={[styles.finalizeBtn, !canSave && { opacity: 0.5 }]}>
            <Text style={styles.finalizeBtnText}>Enregistrer le RDV</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { flex: 1, backgroundColor: DS.cremeFond, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingTop: 18, borderBottomWidth: 1, borderBottomColor: DS.border, gap: 6 },
  backBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: DS.cremeNude, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: DS.cremeNude, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: DS.sombre },
  subtitle: { fontSize: 11, color: DS.textSecondary, marginTop: 1 },
  empty: { fontSize: 12, color: DS.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  crCard: { backgroundColor: DS.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: DS.border, gap: 3 },
  crDate: { fontSize: 13, fontWeight: '700', color: DS.sombre },
  crAuteur: { fontSize: 11, color: DS.textSecondary },
  crStats: { fontSize: 10, color: DS.textSecondary, marginTop: 2 },
  rdvCardTimeline: { backgroundColor: DS.cremeNude, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: DS.marron, borderStyle: 'dashed', gap: 3 },
  rdvDate: { fontSize: 13, fontWeight: '700', color: DS.marron },
  rdvLibelleTL: { fontSize: 12, fontWeight: '600', color: DS.sombre },
  rdvBadge: { backgroundColor: DS.marron, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  rdvBadgeText: { fontSize: 9, color: DS.cremeFond, fontWeight: '700' },
  draftBadge: { backgroundColor: '#FFF3CD', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  draftBadgeText: { fontSize: 9, color: '#856404', fontWeight: '700' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DS.bordeaux, paddingVertical: 12, borderRadius: 12 },
  newRDVBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DS.marron, paddingVertical: 12, borderRadius: 12 },
  newBtnText: { color: DS.cremeFond, fontSize: 13, fontWeight: '700' },
  // Form
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: DS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 },
  dateInput: { backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: DS.sombre, minWidth: 140 },
  readOnly: { backgroundColor: DS.cremeNude },
  sectionCard: { backgroundColor: DS.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: DS.border, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: DS.bordeaux, flex: 1 },
  sectionStats: { fontSize: 11, fontWeight: '600', color: DS.textSecondary },
  subSectionCard: { backgroundColor: DS.cremeNude, borderRadius: 8, padding: 10, gap: 6, borderLeftWidth: 3, borderLeftColor: DS.marron },
  subSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subTitre: { fontSize: 12, fontWeight: '700', color: DS.marron },
  subTitreInput: { flex: 1, fontSize: 12, fontWeight: '700', color: DS.marron, padding: 2, borderBottomWidth: 1, borderBottomColor: DS.marron },
  newSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  newSubInput: { flex: 1, backgroundColor: DS.cremeNude, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, color: DS.sombre, borderWidth: 1, borderColor: DS.border, borderStyle: 'dashed' },
  newTaskBtn: { backgroundColor: DS.bordeaux, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionComment: { backgroundColor: DS.cremeFond, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: DS.sombre, minHeight: 36, marginTop: 4, fontStyle: 'italic', borderWidth: 1, borderColor: DS.border },
  newItemInput: { backgroundColor: DS.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: DS.sombre, borderWidth: 1, borderColor: DS.border },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: DS.bordeaux, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  addItemBtnText: { color: DS.cremeFond, fontSize: 10, fontWeight: '700' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 4 },
  itemText: { fontSize: 13, color: DS.sombre, padding: 4, backgroundColor: DS.surface, borderRadius: 6, borderWidth: 1, borderColor: DS.border, minHeight: 32 },
  itemTextDone: { textDecorationLine: 'line-through', color: DS.textSecondary },
  iconBtn: { padding: 4 },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  attachmentItem: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: DS.cremeNude, borderRadius: 6, paddingLeft: 2, paddingRight: 4 },
  attachmentPdf: { fontSize: 11, color: DS.bordeaux, backgroundColor: DS.cremeNude, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, fontWeight: '600' },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FEE2E2', borderRadius: 8 },
  deleteBtnText: { color: '#E74C3C', fontSize: 11, fontWeight: '700' },
  draftBtn: { backgroundColor: DS.cremeNude, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  draftBtnText: { color: DS.bordeaux, fontSize: 11, fontWeight: '700' },
  finalizeBtn: { backgroundColor: DS.bordeaux, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  finalizeBtnText: { color: DS.cremeFond, fontSize: 12, fontWeight: '700' },
  // Picker catégorisé
  chipBtn: { backgroundColor: DS.cremeNude, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  chipBtnText: { color: DS.bordeaux, fontSize: 11, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chipSelected: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.bordeaux, paddingLeft: 10, paddingRight: 6, paddingVertical: 4, borderRadius: 14, gap: 2 },
  chipSelectedText: { color: DS.cremeFond, fontSize: 11, fontWeight: '700' },
  pickerBox: { marginTop: 6, backgroundColor: DS.surface, borderRadius: 8, borderWidth: 1, borderColor: DS.border, padding: 4 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  pickerRowSelected: { backgroundColor: DS.cremeNude, borderRadius: 6 },
  pickerRowText: { flex: 1, fontSize: 12, color: DS.sombre },
  categoryBox: { borderBottomWidth: 1, borderBottomColor: DS.border },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8 },
  categoryLabel: { fontSize: 12, fontWeight: '700', color: DS.sombre },
  categoryToggle: { fontSize: 14, color: DS.textSecondary },
  categoryEmpty: { fontSize: 11, color: DS.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
});

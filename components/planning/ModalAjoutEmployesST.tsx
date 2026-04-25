import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { DatePicker } from '@/components/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { METIER_COLORS, INTERVENTION_COLORS, type Affectation } from '@/app/types';

// ─── Helpers de date locaux ───────────────────────────────────────────────────
//
// Dupliqués depuis app/(tabs)/planning.tsx — pas de lib/dateUtils centralisée.
// Voir REFACTOR_NOTES.md "Dette technique — Helpers de date dupliqués".

/** Convertit une `Date` en string `YYYY-MM-DD` en heure locale. */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Vérifie qu'une `date` est dans la plage `[start, end]` inclusive (strings YYYY-MM-DD).
 * Comparaison normalisée à minuit local (timezone-safe).
 */
function dateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  return d.getTime() >= s.getTime() && d.getTime() <= e.getTime();
}

// ─── Types exportés ───────────────────────────────────────────────────────────

/**
 * Form values pour l'onglet "Externe" (intervention quick-add).
 * Type partagé avec ModalIntervention (édition séparée) — d'où les setter
 * passés en props.
 */
export interface InterventionFormValues {
  libelle:     string;
  description: string;
  dateDebut:   string;
  dateFin:     string;
  couleur:     string;
}

/**
 * Props du modal d'ajout/suppression d'employés + sous-traitants + intervention
 * externe sur une cellule (chantier × date).
 *
 * Modal controlled hybrid :
 * - Parent contrôle `modal` (cellule cible) + `interventionForm` (partagé avec
 *   ModalIntervention sibling, éditeur d'interventions existantes).
 * - Composant gère en interne `modalSection` (onglet actif) et
 *   `affectationDateFin` (plage d'affectation, reset à chaque ouverture).
 */
export interface ModalAjoutEmployesSTProps {
  /** Cellule cible (chantier × date). null = modale fermée. */
  modal: { chantierId: string; date: string } | null;
  onClose: () => void;
  /** Form state partagé avec ModalIntervention (édition séparée). */
  interventionForm: InterventionFormValues;
  setInterventionForm: React.Dispatch<React.SetStateAction<InterventionFormValues>>;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Modal admin : ajout/suppression d'affectations (employés + sous-traitants)
 * + création rapide d'intervention externe sur une cellule (chantier × date).
 *
 * 3 onglets :
 * - Employés : liste FlatList avec toggle (avec extension de plage optionnelle)
 * - Sous-traitants : idem
 * - Externe : formulaire de création d'intervention + liste des interventions
 *   existantes du chantier
 *
 * Plage d'affectation (jours multiples) : exclut automatiquement les week-ends.
 *
 * ⚠️ Bug pré-existant préservé : `removeAffectation(chantierId, employeId, date)`
 * dans `toggleST` (et indirectement `toggleEmploye`) ne supprime que la cellule
 * ciblée même si l'affectation couvre une plage. Comportement existant — fix
 * hors scope refactor structurel.
 */
export function ModalAjoutEmployesST({
  modal,
  onClose,
  interventionForm,
  setInterventionForm,
}: ModalAjoutEmployesSTProps): React.ReactElement {
  const { data, addAffectation, removeAffectation, addIntervention, deleteIntervention } = useApp();

  // ─── State interne ─────────────────────────────────────────────────────────

  const [modalSection, setModalSection] = useState<'employes' | 'st' | 'externe'>('employes');
  const [affectationDateFin, setAffectationDateFin] = useState<string | null>(null);

  // Reset de la plage d'affectation à chaque ouverture (cell click parent)
  useEffect(() => {
    if (modal !== null) setAffectationDateFin(null);
  }, [modal]);

  // ─── Helpers internes ──────────────────────────────────────────────────────

  // Modal admin : tous les employés disponibles
  const modalEmployes = useMemo(() => {
    if (!modal) return [];
    return data.employes;
  }, [modal, data]);

  const isEmployeInCell = useCallback((employeId: string): boolean => {
    if (!modal) return false;
    const day = new Date(modal.date);
    return data.affectations.some(a =>
      a.chantierId === modal.chantierId &&
      a.employeId === employeId &&
      !a.soustraitantId &&
      dateInRange(day, a.dateDebut, a.dateFin)
    );
  }, [modal, data]);

  const isSTInCell = useCallback((stId: string): boolean => {
    if (!modal) return false;
    const day = new Date(modal.date);
    return data.affectations.some(a =>
      a.chantierId === modal.chantierId &&
      a.soustraitantId === stId &&
      dateInRange(day, a.dateDebut, a.dateFin)
    );
  }, [modal, data]);

  // Génère toutes les dates entre dateDebut et dateFin en excluant les week-ends
  const buildAffectationsSansWeekend = (
    chantierId: string,
    employeId: string,
    dateDebut: string,
    dateFin: string,
    soustraitantId?: string
  ): Affectation[] => {
    const affs: Affectation[] = [];
    let current = new Date(dateDebut);
    current.setHours(12, 0, 0, 0); // midi pour éviter les problèmes de timezone
    const end = new Date(dateFin);
    end.setHours(12, 0, 0, 0);

    let segStart: string | null = null;
    let segEnd: string | null = null;

    while (current <= end) {
      const dow = current.getDay(); // 0=dim, 6=sam
      const isWeekend = dow === 0 || dow === 6;
      const ymd = toYMD(current);

      if (!isWeekend) {
        if (!segStart) segStart = ymd;
        segEnd = ymd;
      } else {
        // Fin d'un segment : créer l'affectation
        if (segStart && segEnd) {
          const aff: Affectation = {
            id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}_${affs.length}`,
            chantierId,
            employeId,
            dateDebut: segStart,
            dateFin: segEnd,
            notes: [],
          };
          if (soustraitantId) aff.soustraitantId = soustraitantId;
          affs.push(aff);
          segStart = null;
          segEnd = null;
        }
      }
      current.setDate(current.getDate() + 1);
    }
    // Dernier segment
    if (segStart && segEnd) {
      const aff: Affectation = {
        id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}_${affs.length}`,
        chantierId,
        employeId,
        dateDebut: segStart,
        dateFin: segEnd,
        notes: [],
      };
      if (soustraitantId) aff.soustraitantId = soustraitantId;
      affs.push(aff);
    }
    return affs;
  };

  const toggleEmploye = (employeId: string) => {
    if (!modal) return;
    if (isEmployeInCell(employeId)) {
      removeAffectation(modal.chantierId, employeId, modal.date);
    } else {
      const dateFin = affectationDateFin && affectationDateFin >= modal.date
        ? affectationDateFin
        : modal.date;
      // Si plage de plusieurs jours : exclure les week-ends
      if (dateFin !== modal.date) {
        const affs = buildAffectationsSansWeekend(modal.chantierId, employeId, modal.date, dateFin);
        affs.forEach(a => addAffectation(a));
      } else {
        // Jour unique : on l'ajoute tel quel (l'utilisateur l'a choisi manuellement)
        const newAff: Affectation = {
          id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          chantierId: modal.chantierId,
          employeId,
          dateDebut: modal.date,
          dateFin: modal.date,
          notes: [],
        };
        addAffectation(newAff);
      }
    }
  };

  const toggleST = (stId: string) => {
    if (!modal) return;
    if (isSTInCell(stId)) {
      // Supprimer l'affectation ST
      const aff = data.affectations.find(a =>
        a.chantierId === modal.chantierId &&
        a.soustraitantId === stId &&
        dateInRange(new Date(modal.date), a.dateDebut, a.dateFin)
      );
      if (aff) removeAffectation(modal.chantierId, aff.employeId, modal.date);
    } else {
      const stPseudoId = `st:${stId}`;
      const dateFin = affectationDateFin && affectationDateFin >= modal.date
        ? affectationDateFin
        : modal.date;
      // Si plage de plusieurs jours : exclure les week-ends
      if (dateFin !== modal.date) {
        const affs = buildAffectationsSansWeekend(modal.chantierId, stPseudoId, modal.date, dateFin, stId);
        affs.forEach(a => addAffectation(a));
      } else {
        const newAff: Affectation = {
          id: `aff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          chantierId: modal.chantierId,
          employeId: stPseudoId,
          soustraitantId: stId,
          dateDebut: modal.date,
          dateFin: modal.date,
          notes: [],
        };
        addAffectation(newAff);
      }
    }
  };

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={modal !== null}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}><Pressable style={{ flex: 0.05 }} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKAV}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{data.chantiers.find(c => c.id === modal?.chantierId)?.nom}</Text>
              <Pressable onPress={onClose} style={styles.modalXBtn}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>
            {modal && (
              <Text style={styles.modalSubtitle}>{modal.date}</Text>
            )}

            {/* Onglets Employés / Sous-traitants / Externe */}
            <View style={styles.modalSectionTabs}>
              <Pressable
                style={[styles.modalSectionTab, modalSection === 'employes' && styles.modalSectionTabActive]}
                onPress={() => setModalSection('employes')}
              >
                <Text style={[styles.modalSectionTabText, modalSection === 'employes' && styles.modalSectionTabTextActive]}>
                  Employés
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalSectionTab, modalSection === 'st' && styles.modalSectionTabActive]}
                onPress={() => setModalSection('st')}
              >
                <Text style={[styles.modalSectionTabText, modalSection === 'st' && styles.modalSectionTabTextActive]}>
                  Sous-traitants
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalSectionTab, modalSection === 'externe' && styles.modalSectionTabActive]}
                onPress={() => setModalSection('externe')}
              >
                <Text style={[styles.modalSectionTabText, modalSection === 'externe' && styles.modalSectionTabTextActive]}>
                  ⚡ Externe
                </Text>
              </Pressable>
            </View>

            {/* Plage de jours pour l'affectation (admin) */}
            {(modalSection === 'employes' || modalSection === 'st') && modal && (
              <View style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
                <Text style={[styles.noteLabel, { fontSize: 12, color: '#687076', marginBottom: 4 }]}>
                  Plage d'affectation (optionnel)
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, color: '#444', minWidth: 30 }}>Du :</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2C' }}>{modal.date.split('-').reverse().join('/')}</Text>
                  <Text style={{ fontSize: 12, color: '#444', marginLeft: 8, minWidth: 30 }}>Au :</Text>
                  <DatePicker
                    value={affectationDateFin || modal.date}
                    onChange={v => {
                      setAffectationDateFin(v);
                      // Si des employés sont déjà affectés ce jour-là, étendre leur affectation
                      if (v && v > modal.date) {
                        const empsInCell = data.affectations
                          .filter(a => a.chantierId === modal.chantierId && a.dateDebut <= modal.date && a.dateFin >= modal.date && !a.soustraitantId)
                          .map(a => a.employeId);
                        empsInCell.forEach(empId => {
                          // Supprimer l'affectation jour unique existante
                          removeAffectation(modal.chantierId, empId, modal.date);
                          // Recréer avec la plage complète (sans week-ends)
                          const affs = buildAffectationsSansWeekend(modal.chantierId, empId, modal.date, v);
                          affs.forEach(a => addAffectation(a));
                        });
                        // Étendre aussi les sous-traitants déjà affectés ce jour-là
                        const stsInCell = data.affectations
                          .filter(a => a.chantierId === modal.chantierId && a.dateDebut <= modal.date && a.dateFin >= modal.date && !!a.soustraitantId)
                          .map(a => ({ stId: a.soustraitantId!, pseudoEmployeId: a.employeId }));
                        stsInCell.forEach(({ stId, pseudoEmployeId }) => {
                          removeAffectation(modal.chantierId, pseudoEmployeId, modal.date);
                          const affs = buildAffectationsSansWeekend(modal.chantierId, pseudoEmployeId, modal.date, v, stId);
                          affs.forEach(a => addAffectation(a));
                        });
                      }
                    }}
                    minDate={modal.date}
                    placeholder="Fin (optionnel)"
                  />
                  {affectationDateFin && affectationDateFin !== modal.date && (
                    <Pressable
                      onPress={() => setAffectationDateFin(null)}
                      style={{ padding: 4 }}
                    >
                      <Text style={{ color: '#E74C3C', fontSize: 12 }}>✕</Text>
                    </Pressable>
                  )}
                </View>
                {affectationDateFin && affectationDateFin > modal.date && (
                  <Text style={{ fontSize: 11, color: '#27AE60', marginTop: 2 }}>
                    Affecté du {modal.date.split('-').reverse().join('/')} au {affectationDateFin.split('-').reverse().join('/')} (week-ends exclus automatiquement)
                  </Text>
                )}
              </View>
            )}

            {/* Liste employés */}
            {modalSection === 'employes' && (
              <FlatList
                data={modalEmployes}
                extraData={data.affectations}
                keyExtractor={item => item.id}
                renderItem={({ item }) => {
                  const mc = METIER_COLORS[item.metier];
                  const selected = isEmployeInCell(item.id);
                  return (
                    <Pressable
                      style={[styles.modalEmpRow, selected && styles.modalEmpRowSelected]}
                      onPress={() => toggleEmploye(item.id)}
                    >
                      <View style={[styles.modalAvatar, { backgroundColor: mc.color }]}>
                        <Text style={[styles.modalAvatarText, { color: mc.textColor }]}>
                          {item.prenom?.[0] || '?'}
                        </Text>
                      </View>
                      <View style={styles.modalEmpInfo}>
                        <Text style={styles.modalEmpName}>{item.prenom} {item.nom}</Text>
                        <Text style={styles.modalEmpMetier}>{mc.label}</Text>
                      </View>
                      {selected && <Text style={styles.modalCheck}>✓</Text>}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <EmptyState size="sm" title="Aucun employé disponible." />
                }
                style={{ maxHeight: 280 }}
              />
            )}

            {/* Liste sous-traitants */}
            {modalSection === 'st' && (
              <FlatList
                data={data.sousTraitants}
                extraData={data.affectations}
                keyExtractor={item => item.id}
                renderItem={({ item }) => {
                  const selected = isSTInCell(item.id);
                  return (
                    <Pressable
                      style={[styles.modalEmpRow, selected && styles.modalEmpRowSelected]}
                      onPress={() => toggleST(item.id)}
                    >
                      <View style={[styles.modalAvatar, { backgroundColor: item.couleur }]}>
                        <Text style={[styles.modalAvatarText, { color: '#fff' }]}>
                          {item.prenom?.[0] || '?'}
                        </Text>
                      </View>
                      <View style={styles.modalEmpInfo}>
                        <Text style={styles.modalEmpName}>{item.prenom} {item.nom}</Text>
                        {item.societe ? <Text style={styles.modalEmpMetier}>{item.societe}</Text> : null}
                      </View>
                      {selected && <Text style={styles.modalCheck}>✓</Text>}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <EmptyState size="sm" title="Aucun sous-traitant. Créez-en dans l'onglet dédié." />
                }
                style={{ maxHeight: 280 }}
              />
            )}

            {/* Formulaire intervention externe */}
            {modalSection === 'externe' && modal && (
              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.intervFormLabel}>Libellé *</Text>
                <TextInput
                  style={styles.intervFormInput}
                  value={interventionForm.libelle}
                  onChangeText={v => setInterventionForm(f => ({ ...f, libelle: v }))}
                  placeholder="Ex: Menuiserie Dupont, Livraison matériaux..."
                  placeholderTextColor="#B0BEC5"
                  autoFocus
                />
                <Text style={[styles.intervFormLabel, { marginTop: 12 }]}>Description (optionnel)</Text>
                <TextInput
                  style={[styles.intervFormInput, { minHeight: 60 }]}
                  value={interventionForm.description}
                  onChangeText={v => setInterventionForm(f => ({ ...f, description: v }))}
                  placeholder="Détails, contact, numéro de téléphone..."
                  placeholderTextColor="#B0BEC5"
                  multiline
                />
                <View style={styles.intervDateRow}>
                  <View style={{ flex: 1 }}>
                    <DatePicker
                      label="Du *"
                      value={interventionForm.dateDebut}
                      onChange={v => setInterventionForm(f => ({ ...f, dateDebut: v }))}
                    />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <DatePicker
                      label="Au *"
                      value={interventionForm.dateFin}
                      onChange={v => setInterventionForm(f => ({ ...f, dateFin: v }))}
                      minDate={interventionForm.dateDebut || undefined}
                    />
                  </View>
                </View>
                <Text style={[styles.intervFormLabel, { marginTop: 12 }]}>Couleur</Text>
                <View style={styles.intervColorRow}>
                  {INTERVENTION_COLORS.map(c => (
                    <Pressable
                      key={c}
                      style={[styles.intervColorSwatch, { backgroundColor: c }, interventionForm.couleur === c && styles.intervColorSwatchActive]}
                      onPress={() => setInterventionForm(f => ({ ...f, couleur: c }))}
                    />
                  ))}
                </View>
                <Pressable
                  style={styles.intervSaveBtn}
                  onPress={() => {
                    if (!interventionForm.libelle.trim()) return;
                    const now = new Date().toISOString();
                    addIntervention({
                      id: `int_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                      chantierId: modal.chantierId,
                      libelle: interventionForm.libelle.trim(),
                      description: interventionForm.description.trim() || undefined,
                      dateDebut: interventionForm.dateDebut || modal.date,
                      dateFin: interventionForm.dateFin || modal.date,
                      couleur: interventionForm.couleur,
                      createdAt: now,
                    });
                    setInterventionForm({ libelle: '', description: '', dateDebut: modal.date, dateFin: modal.date, couleur: INTERVENTION_COLORS[0] });
                    onClose();
                  }}
                >
                  <Text style={styles.intervSaveBtnText}>✓ Ajouter l'intervention</Text>
                </Pressable>
                {/* Liste des interventions existantes sur ce chantier */}
                {(data.interventions || []).filter(i => i.chantierId === modal.chantierId).length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.intervFormLabel, { marginBottom: 8 }]}>Interventions existantes</Text>
                    {(data.interventions || []).filter(i => i.chantierId === modal.chantierId).map(interv => (
                      <View key={interv.id} style={[styles.intervExistingRow, { borderLeftColor: interv.couleur }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.intervExistingLabel}>{interv.libelle}</Text>
                          <Text style={styles.intervExistingDates}>{interv.dateDebut} → {interv.dateFin}</Text>
                        </View>
                        <Pressable onPress={() => deleteIntervention(interv.id)} style={styles.intervExistingDelete}>
                          <Text style={{ color: '#E74C3C', fontSize: 16 }}>🗑</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}

            <Pressable style={styles.modalCloseBtn} onPress={onClose}>
              <Text style={styles.modalCloseBtnText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// Styles dupliqués depuis app/(tabs)/planning.tsx — pattern Phase 2 (préservation
// 1:1, pas de _shared/modalStyles tant que < 3 consommateurs distincts).
// TODO Phase 3 : DS violations (couleurs hex en dur, magic numbers) à corriger
// avec une passe de cleanup global ; voir CLAUDE.md règles design system.

const styles = StyleSheet.create({
  // — Modal layout shared —
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalKAV: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E6EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#687076',
    marginBottom: 16,
  },
  modalXBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5EDE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalXText: {
    fontSize: 14,
    color: '#687076',
    fontWeight: '700',
  },
  modalCloseBtn: {
    marginTop: 16,
    backgroundColor: '#2C2C2C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 8,
  },

  // — Tabs section —
  modalSectionTabs: {
    flexDirection: 'row',
    backgroundColor: '#E2E6EA',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  modalSectionTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSectionTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  modalSectionTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#687076',
  },
  modalSectionTabTextActive: {
    color: '#2C2C2C',
  },

  // — Listes employés / ST —
  modalEmpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F5EDE3',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modalEmpRowSelected: {
    borderColor: '#2C2C2C',
    backgroundColor: '#EEF2F8',
  },
  modalAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modalAvatarText: {
    fontWeight: '700',
    fontSize: 15,
  },
  modalEmpInfo: { flex: 1 },
  modalEmpName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  modalEmpMetier: {
    fontSize: 12,
    color: '#687076',
    marginTop: 1,
  },
  modalCheck: {
    color: '#2C2C2C',
    fontWeight: '700',
    fontSize: 16,
  },

  // — Intervention quick-add —
  intervFormLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  intervFormInput: {
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  intervDateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  intervColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  intervColorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  intervColorSwatchActive: {
    borderColor: '#11181C',
    transform: [{ scale: 1.2 }],
  },
  intervSaveBtn: {
    backgroundColor: '#2C2C2C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  intervSaveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  intervExistingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ccc',
  },
  intervExistingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  intervExistingDates: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },
  intervExistingDelete: {
    padding: 8,
  },
});

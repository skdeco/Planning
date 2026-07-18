import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, TextInput, Modal, Alert, Platform, StyleSheet } from 'react-native';
import { Plus, Pencil, Trash2, Wand2, Camera, Lock } from 'lucide-react-native';
import type { LotAvancement, SnapshotAvancement } from '@/app/types';
import { DS } from '@/constants/design';
import { ProgressBar } from './ProgressBar';
import { calculerSnapshot, creerSnapshot } from '@/lib/snapshotsHelpers';

/**
 * AvancementLotsPanel — Gestion des lots / corps de métier (palette V10).
 *
 * Composant générique : prend une liste de lots + un callback pour
 * la mise à jour, ne fait aucune hypothèse sur le parent (marché ou
 * supplément). Le parent gère la persistance.
 *
 * Affiche :
 * - Bar globale d'avancement (moyenne pondérée par montant ou simple)
 * - Liste des lots avec barre individuelle + nom + montant + actions admin
 * - Modal d'édition lot (admin uniquement)
 */
export interface AvancementLotsPanelProps {
  /** Lots à afficher / modifier. */
  lots: LotAvancement[];
  /** Callback déclenché à chaque modification (add/edit/delete). */
  onChangeLots: (lots: LotAvancement[]) => void;
  isAdmin: boolean;
  /** Callback "Importer depuis le devis" — si défini, affiche le bouton. */
  onPressImport?: () => void;
  /** Titre personnalisable (par défaut "📊 Avancement par lot"). */
  title?: string;
  /** Variante de mise en page : version compacte pour intégration en card. */
  compact?: boolean;
  /** Snapshots de facturation (historique des situations figées). */
  snapshots?: SnapshotAvancement[];
  /** Callback pour modifier la liste des snapshots (ajout/suppression). */
  onChangeSnapshots?: (snapshots: SnapshotAvancement[]) => void;
  /** Identité de l'admin qui fige (pour traçabilité dans le snapshot). */
  cocheParId?: string;
  cocheParNom?: string;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

export function AvancementLotsPanel({
  lots,
  onChangeLots,
  isAdmin,
  onPressImport,
  title = '📊 Avancement par lot',
  compact = false,
  snapshots,
  onChangeSnapshots,
  cocheParId,
  cocheParNom,
}: AvancementLotsPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [editLotId, setEditLotId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nom: '',
    montant: '',
    pourcentage: 0,
    commentaire: '',
  });

  // Calcul de l'avancement global (moyenne pondérée par montant si présent, sinon moyenne simple)
  const avancementGlobal = useMemo(() => {
    if (lots.length === 0) return null;
    const avecMontant = lots.filter(l => l.montant && l.montant > 0);
    if (avecMontant.length === lots.length && avecMontant.length > 0) {
      // Moyenne pondérée par montant
      const totalMontant = avecMontant.reduce((s, l) => s + (l.montant || 0), 0);
      const sumPondere = avecMontant.reduce((s, l) => s + (l.pourcentage * (l.montant || 0)), 0);
      return Math.round(sumPondere / totalMontant);
    }
    // Moyenne simple
    const moy = lots.reduce((s, l) => s + l.pourcentage, 0) / lots.length;
    return Math.round(moy);
  }, [lots]);

  const totalMontants = useMemo(
    () => lots.reduce((s, l) => s + (l.montant || 0), 0),
    [lots]
  );
  const montantAvance = useMemo(
    () => lots.reduce((s, l) => s + ((l.montant || 0) * (l.pourcentage / 100)), 0),
    [lots]
  );

  const openNew = () => {
    setEditLotId(null);
    setForm({ nom: '', montant: '', pourcentage: 0, commentaire: '' });
    setShowForm(true);
  };

  const openEdit = (l: LotAvancement) => {
    setEditLotId(l.id);
    setForm({
      nom: l.nom,
      montant: l.montant ? String(l.montant) : '',
      pourcentage: l.pourcentage,
      commentaire: l.commentaire || '',
    });
    setShowForm(true);
  };

  const save = () => {
    if (!form.nom.trim()) return;
    const entry: LotAvancement = {
      id: editLotId || genId('lot'),
      nom: form.nom.trim(),
      pourcentage: Math.max(0, Math.min(100, Math.round(form.pourcentage))),
      montant: form.montant.trim() ? parseFloat(form.montant.replace(',', '.')) || undefined : undefined,
      commentaire: form.commentaire.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    const next = editLotId
      ? lots.map(l => (l.id === editLotId ? { ...l, ...entry } : l))
      : [...lots, entry];
    onChangeLots(next);
    setShowForm(false);
  };

  const confirmDelete = (id: string) => {
    const doDel = () => onChangeLots(lots.filter(l => l.id !== id));
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Supprimer ce lot ?')) doDel();
    } else {
      Alert.alert('Supprimer', 'Supprimer ce lot ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDel },
      ]);
    }
  };

  const confirmDeleteAll = () => {
    const doDel = () => onChangeLots([]);
    const msg = `Supprimer les ${lots.length} lot${lots.length > 1 ? 's' : ''} ? Cette action est irréversible.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) doDel();
    } else {
      Alert.alert('Tout supprimer', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Tout supprimer', style: 'destructive', onPress: doDel },
      ]);
    }
  };

  // V10 Phase B — Figer la situation pour facturation
  const snapshotsArr = snapshots || [];
  const calc = useMemo(() => calculerSnapshot(lots, snapshotsArr), [lots, snapshotsArr]);
  const canFiger = isAdmin && !!onChangeSnapshots && lots.length > 0
    && calc.montantFacturableNouveau > 0;

  const handleFiger = () => {
    if (!onChangeSnapshots) return;
    const newSnap = creerSnapshot({
      lots,
      snapshotsExistants: snapshotsArr,
      cocheParId,
      cocheParNom,
    });
    const msg = `Situation N°${newSnap.numero} — ${fmt(newSnap.cumulFacture)} € HT cumulés. ` +
      `À facturer maintenant : ${fmt(calc.montantFacturableNouveau)} € HT. Confirmer ?`;
    const doIt = () => onChangeSnapshots([...snapshotsArr, newSnap]);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) doIt();
    } else {
      Alert.alert(newSnap.intitule || 'Figer la situation', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Figer', style: 'default', onPress: doIt },
      ]);
    }
  };

  const supprimerSnapshot = (snapId: string) => {
    if (!onChangeSnapshots) return;
    const doDel = () => onChangeSnapshots(snapshotsArr.filter(s => s.id !== snapId));
    const msg = 'Supprimer cette situation figée ? Cette action est irréversible.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) doDel();
    } else {
      Alert.alert('Supprimer la situation', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDel },
      ]);
    }
  };

  const formatDateFR = (iso: string): string => {
    try {
      const d = new Date(iso);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${d.getFullYear()}`;
    } catch { return iso; }
  };

  return (
    <View style={styles.container}>
      {/* Header section */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {lots.length > 0 && (
            <Text style={styles.sectionSubtitle}>
              {lots.length} lot{lots.length > 1 ? 's' : ''}
              {totalMontants > 0 && ` · ${fmt(montantAvance)} / ${fmt(totalMontants)} € HT`}
            </Text>
          )}
        </View>
        {avancementGlobal !== null && (
          <View style={styles.globalBadge}>
            <Text style={styles.globalBadgeText}>{avancementGlobal}%</Text>
          </View>
        )}
      </View>

      {/* Bar globale */}
      {avancementGlobal !== null && (
        <View style={{ marginBottom: 12 }}>
          <ProgressBar value={avancementGlobal} variant="bordeaux" />
        </View>
      )}

      {/* Liste des lots */}
      {lots.length === 0 ? (
        <Text style={styles.empty}>Aucun lot. Ajoute le premier ci-dessous.</Text>
      ) : (
        lots.map(l => (
          <View key={l.id} style={styles.lotCard}>
            <View style={styles.lotHead}>
              <Text style={styles.lotNom}>{l.nom}</Text>
              <Text style={styles.lotPct}>{l.pourcentage}%</Text>
            </View>
            <ProgressBar value={l.pourcentage} variant="bordeaux" />
            {(l.montant ?? 0) > 0 && (
              <Text style={styles.lotMontant}>
                {fmt(((l.montant || 0) * l.pourcentage) / 100)} / {fmt(l.montant || 0)} € HT
              </Text>
            )}
            {!!l.commentaire && <Text style={styles.lotComment}>{l.commentaire}</Text>}
            {isAdmin && (
              <View style={styles.lotActions}>
                <Pressable onPress={() => openEdit(l)} style={styles.actionBtn}>
                  <Pencil size={12} color={DS.bordeaux} strokeWidth={2.2} />
                  <Text style={styles.actionBtnText}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(l.id)} style={styles.actionBtnDanger}>
                  <Trash2 size={12} color="#E74C3C" strokeWidth={2.2} />
                  <Text style={styles.actionBtnDangerText}>Supprimer</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}

      {/* Boutons admin : Import devis + Ajout manuel + Figer + Tout supprimer */}
      {isAdmin && (
        <View style={{ gap: 6, marginTop: 8 }}>
          {onPressImport && (
            <Pressable onPress={onPressImport} style={styles.importBtn}>
              <Wand2 size={14} color={DS.cremeFond} strokeWidth={2.5} />
              <Text style={styles.importBtnText}>Importer depuis le devis</Text>
            </Pressable>
          )}
          {canFiger && (
            <Pressable onPress={handleFiger} style={styles.figerBtn}>
              <Camera size={14} color={DS.cremeFond} strokeWidth={2.5} />
              <Text style={styles.figerBtnText}>Figer ce point ({fmt(calc.montantFacturableNouveau)} € à facturer)
              </Text>
            </Pressable>
          )}
          <Pressable onPress={openNew} style={styles.addBtnSecondary}>
            <Plus size={13} color={DS.bordeaux} strokeWidth={2.5} />
            <Text style={styles.addBtnSecondaryText}>Ajouter un lot manuellement</Text>
          </Pressable>
          {lots.length > 0 && (
            <Pressable onPress={confirmDeleteAll} style={styles.clearAllBtn}>
              <Trash2 size={12} color="#E74C3C" strokeWidth={2.2} />
              <Text style={styles.clearAllBtnText}>Tout supprimer ({lots.length})</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* V10 Phase B — Historique des situations figées (visible admin + client) */}
      {snapshotsArr.length > 0 && (
        <View style={styles.snapshotsSection}>
          <Text style={styles.snapshotsTitle}>Historique facturation ({snapshotsArr.length})
          </Text>
          {snapshotsArr.map(snap => (
            <View key={snap.id} style={styles.snapshotCard}>
              <View style={styles.snapshotHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.snapshotTitre}>
                    {snap.intitule || `Situation N°${snap.numero ?? '?'}`}
                  </Text>
                  <Text style={styles.snapshotMeta}>
                    Figée le {formatDateFR(snap.dateGel)}
                    {snap.cocheParNom ? ` · ${snap.cocheParNom}` : ''}
                  </Text>
                </View>
                <Lock size={11} color={DS.textSecondary} strokeWidth={2.2} />
              </View>
              <View style={styles.snapshotTotaux}>
                <Text style={styles.snapshotMontant}>
                  {fmt(snap.lots.reduce((s, l) => s + l.montantFactureNouveau, 0))} € HT
                </Text>
                <Text style={styles.snapshotMontantSub}>
                  · Cumul : {fmt(snap.cumulFacture)} € HT
                </Text>
              </View>
              {isAdmin && onChangeSnapshots && (
                <Pressable onPress={() => supprimerSnapshot(snap.id)} style={styles.snapshotDelBtn}>
                  <Trash2 size={10} color="#E74C3C" strokeWidth={2.2} />
                  <Text style={styles.snapshotDelBtnText}>Supprimer</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Modal d'édition lot (l'import est rendu dans le parent via ImportLotsDevisOverlay) */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowForm(false)}>
          <Pressable style={styles.modalSheet} onPress={() => { /* swallow */ }}>
            <Text style={styles.modalTitle}>
              {editLotId ? 'Modifier le lot' : 'Nouveau lot'}
            </Text>

            <Text style={styles.fieldLabel}>Nom du lot *</Text>
            <TextInput
              style={styles.input}
              value={form.nom}
              onChangeText={v => setForm(f => ({ ...f, nom: v }))}
              placeholder="Ex: Cloisons, Plomberie, Électricité…"
              placeholderTextColor={DS.textSecondary}
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Avancement : {form.pourcentage}%</Text>
            <View style={styles.percentRow}>
              {[0, 10, 25, 50, 75, 90, 100].map(p => (
                <Pressable
                  key={p}
                  onPress={() => setForm(f => ({ ...f, pourcentage: p }))}
                  style={[styles.percentChip, form.pourcentage === p && styles.percentChipActive]}
                >
                  <Text style={[styles.percentChipText, form.pourcentage === p && styles.percentChipTextActive]}>{p}%</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Montant HT (optionnel)</Text>
            <TextInput
              style={styles.input}
              value={form.montant}
              onChangeText={v => setForm(f => ({ ...f, montant: v }))}
              placeholder="Ex: 4500"
              placeholderTextColor={DS.textSecondary}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Commentaire (optionnel)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={form.commentaire}
              onChangeText={v => setForm(f => ({ ...f, commentaire: v }))}
              placeholder="Détails, blocages, dates…"
              placeholderTextColor={DS.textSecondary}
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowForm(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </Pressable>
              <Pressable onPress={save} disabled={!form.nom.trim()} style={[styles.saveBtn, !form.nom.trim() && { opacity: 0.5 }]}>
                <Text style={styles.saveBtnText}>{editLotId ? 'Enregistrer' : 'Ajouter'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: DS.cremeFond,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: DS.sombre,
    letterSpacing: -0.01,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: DS.textSecondary,
    marginTop: 2,
  },
  globalBadge: {
    backgroundColor: DS.bordeaux,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  globalBadgeText: {
    color: DS.cremeFond,
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    fontSize: 12,
    color: DS.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  lotCard: {
    backgroundColor: DS.surface,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  lotHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lotNom: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.sombre,
    flex: 1,
  },
  lotPct: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.bordeaux,
  },
  lotMontant: {
    fontSize: 11,
    color: DS.textSecondary,
  },
  lotComment: {
    fontSize: 11,
    color: DS.textSecondary,
    fontStyle: 'italic',
  },
  lotActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: DS.cremeNude,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.bordeaux,
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  actionBtnDangerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E74C3C',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: DS.bordeaux,
    paddingVertical: 12,
    borderRadius: 10,
  },
  importBtnText: {
    color: DS.cremeFond,
    fontSize: 13,
    fontWeight: '700',
  },
  addBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DS.border,
    borderStyle: 'dashed',
  },
  addBtnSecondaryText: {
    color: DS.bordeaux,
    fontSize: 12,
    fontWeight: '600',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearAllBtnText: {
    color: '#E74C3C',
    fontSize: 11,
    fontWeight: '600',
  },
  figerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: DS.marron,
    paddingVertical: 10,
    borderRadius: 10,
  },
  figerBtnText: {
    color: DS.cremeFond,
    fontSize: 12,
    fontWeight: '700',
  },
  snapshotsSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: DS.border,
    gap: 6,
  },
  snapshotsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.sombre,
    marginBottom: 2,
  },
  snapshotCard: {
    backgroundColor: DS.cremeNude,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  snapshotTitre: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.sombre,
  },
  snapshotMeta: {
    fontSize: 10,
    color: DS.textSecondary,
    marginTop: 1,
  },
  snapshotTotaux: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  snapshotMontant: {
    fontSize: 13,
    fontWeight: '700',
    color: DS.bordeaux,
  },
  snapshotMontantSub: {
    fontSize: 10,
    color: DS.textSecondary,
  },
  snapshotDelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  snapshotDelBtnText: {
    fontSize: 10,
    color: '#E74C3C',
    fontWeight: '600',
  },
  modeChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: DS.cremeNude,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: DS.bordeaux,
  },
  modeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.bordeaux,
  },
  modeChipTextActive: {
    color: DS.cremeFond,
  },
  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: DS.bordeaux,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  pdfInfoBox: {
    backgroundColor: DS.cremeNude,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DS.border,
  },
  pdfInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.sombre,
  },
  detectBtnText: {
    color: DS.cremeFond,
    fontSize: 12,
    fontWeight: '700',
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: DS.border,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: DS.textSecondary,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: DS.bordeaux,
    borderColor: DS.bordeaux,
  },
  checkboxIcon: {
    color: DS.cremeFond,
    fontSize: 12,
    fontWeight: '700',
  },
  detectedNom: {
    fontSize: 12,
    color: DS.sombre,
    fontWeight: '500',
  },
  detectedMontant: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.bordeaux,
    minWidth: 70,
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalSheet: {
    backgroundColor: DS.surface,
    borderRadius: 16,
    padding: 18,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: DS.sombre,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.textSecondary,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    backgroundColor: DS.cremeFond,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: DS.sombre,
  },
  percentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  percentChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: DS.cremeNude,
  },
  percentChipActive: {
    backgroundColor: DS.bordeaux,
  },
  percentChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.bordeaux,
  },
  percentChipTextActive: {
    color: DS.cremeFond,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: DS.cremeNude,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: DS.sombre,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: DS.bordeaux,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: DS.cremeFond,
    fontWeight: '700',
  },
});

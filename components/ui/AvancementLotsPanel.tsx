import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, Alert, Platform, StyleSheet } from 'react-native';
import { Plus, Pencil, Trash2, Wand2 } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import { DS } from '@/constants/design';
import { ProgressBar } from './ProgressBar';
import { extraireLotsAvecRemise, parseSaisieManuelle, type LotExtrait } from '@/lib/devisParser';

/**
 * AvancementLotsPanel — Gestion des lots / corps de métier d'un chantier (palette V10).
 *
 * Affiche :
 * - Bar globale d'avancement (moyenne pondérée par montant ou simple)
 * - Liste des lots avec barre individuelle + nom + montant + actions admin
 * - Modal d'édition lot (admin uniquement)
 *
 * Utilisé par MarchesChantier (côté admin). À terme aussi par PortailClient
 * (refacto séparé : actuellement PortailClient duplique la logique).
 */
export interface AvancementLotsPanelProps {
  chantier: Chantier;
  isAdmin: boolean;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

export function AvancementLotsPanel({ chantier, isAdmin }: AvancementLotsPanelProps) {
  const { updateChantier } = useApp();
  const lots = chantier.avancementCorps || [];

  const [showForm, setShowForm] = useState(false);
  const [editLotId, setEditLotId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nom: '',
    montant: '',
    pourcentage: 0,
    commentaire: '',
  });
  // V10 — Import depuis devis
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'coller' | 'rapide'>('coller');
  const [importTexte, setImportTexte] = useState('');
  const [lotsDetectes, setLotsDetectes] = useState<LotExtrait[]>([]);
  const [lotsSelection, setLotsSelection] = useState<Record<number, boolean>>({});

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

  const openEdit = (l: NonNullable<Chantier['avancementCorps']>[number]) => {
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
    const entry = {
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
    updateChantier({ ...chantier, avancementCorps: next });
    setShowForm(false);
  };

  // V10 — Détection automatique des lots depuis le texte du devis
  const detecterLots = () => {
    let lots: LotExtrait[];
    let remiseInfo: { remiseHT: number; totalBrutHT: number } | null = null;
    if (importMode === 'coller') {
      const r = extraireLotsAvecRemise(importTexte);
      lots = r.lots;
      if (r.remiseHT > 0) remiseInfo = { remiseHT: r.remiseHT, totalBrutHT: r.totalBrutHT };
    } else {
      lots = parseSaisieManuelle(importTexte);
    }
    setLotsDetectes(lots);
    const sel: Record<number, boolean> = {};
    lots.forEach((_, i) => { sel[i] = true; });
    setLotsSelection(sel);
    if (lots.length === 0) {
      const msg = 'Aucun lot détecté. Vérifiez que le texte contient bien des lignes avec un nom et un montant.';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(msg);
      } else {
        Alert.alert('Aucun lot détecté', msg);
      }
    } else if (remiseInfo) {
      const msg = `✓ ${lots.length} lots détectés\n🎯 Remise de ${remiseInfo.remiseHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT ventilée au prorata`;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(msg);
      } else {
        Alert.alert('Extraction', msg);
      }
    }
  };

  const importerLots = () => {
    const aImporter = lotsDetectes.filter((_, i) => lotsSelection[i]);
    if (aImporter.length === 0) return;
    const existing = chantier.avancementCorps || [];
    const nomsExistants = new Set(existing.map(c => c.nom.toLowerCase().trim()));
    const nouveaux = aImporter
      .filter(l => !nomsExistants.has(l.nom.toLowerCase().trim()))
      .map(l => ({
        id: genId('lot'),
        nom: l.nom,
        montant: l.montantHT,
        pourcentage: 0,
        updatedAt: new Date().toISOString(),
      }));
    if (nouveaux.length === 0) {
      const msg = 'Tous les lots sélectionnés existent déjà dans ce chantier.';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(msg);
      } else {
        Alert.alert('Rien à importer', msg);
      }
      return;
    }
    updateChantier({ ...chantier, avancementCorps: [...existing, ...nouveaux] });
    setShowImport(false);
    setImportTexte('');
    setLotsDetectes([]);
    setLotsSelection({});
  };

  const toggleLotSel = (i: number) => {
    setLotsSelection(prev => ({ ...prev, [i]: !prev[i] }));
  };

  const confirmDelete = (id: string) => {
    const doDel = () => updateChantier({ ...chantier, avancementCorps: lots.filter(l => l.id !== id) });
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Supprimer ce lot ?')) doDel();
    } else {
      Alert.alert('Supprimer', 'Supprimer ce lot ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDel },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header section */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>📊 Avancement par lot</Text>
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
            {l.montant && l.montant > 0 && (
              <Text style={styles.lotMontant}>
                {fmt((l.montant * l.pourcentage) / 100)} / {fmt(l.montant)} € HT
              </Text>
            )}
            {l.commentaire && <Text style={styles.lotComment}>💬 {l.commentaire}</Text>}
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

      {/* Boutons admin : Import depuis devis (priorité) + Ajout manuel */}
      {isAdmin && (
        <View style={{ gap: 6, marginTop: 8 }}>
          <Pressable onPress={() => setShowImport(true)} style={styles.importBtn}>
            <Wand2 size={14} color={DS.cremeFond} strokeWidth={2.5} />
            <Text style={styles.importBtnText}>Importer depuis le devis</Text>
          </Pressable>
          <Pressable onPress={openNew} style={styles.addBtnSecondary}>
            <Plus size={13} color={DS.bordeaux} strokeWidth={2.5} />
            <Text style={styles.addBtnSecondaryText}>Ajouter un lot manuellement</Text>
          </Pressable>
        </View>
      )}

      {/* === Modal Import depuis devis === */}
      <Modal visible={showImport} transparent animationType="slide" onRequestClose={() => setShowImport(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowImport(false)}>
          <Pressable style={[styles.modalSheet, { maxWidth: 600, width: '100%' }]} onPress={() => { /* swallow */ }}>
            <Text style={styles.modalTitle}>🤖 Importer les lots depuis le devis</Text>

            {/* Choix mode */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              <Pressable
                onPress={() => setImportMode('coller')}
                style={[styles.modeChip, importMode === 'coller' && styles.modeChipActive]}
              >
                <Text style={[styles.modeChipText, importMode === 'coller' && styles.modeChipTextActive]}>
                  📋 Coller texte devis
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setImportMode('rapide')}
                style={[styles.modeChip, importMode === 'rapide' && styles.modeChipActive]}
              >
                <Text style={[styles.modeChipText, importMode === 'rapide' && styles.modeChipTextActive]}>
                  ⚡ Saisie rapide
                </Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>
              {importMode === 'coller'
                ? 'Collez ici le texte de votre devis (lots + montants)'
                : 'Saisie libre : 1 lot par ligne, format "Nom du lot : montant"'}
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 140, textAlignVertical: 'top', fontSize: 12 }]}
              value={importTexte}
              onChangeText={setImportTexte}
              placeholder={
                importMode === 'coller'
                  ? 'Cloisons placo BA13................. 4 500,00 €\nCarrelage salle de bain............... 3 200,00 €\nÉlectricité (mise aux normes)......... 5 800,00 €\n...'
                  : 'Cloisons : 4500\nCarrelage : 3200\nÉlectricité : 5800'
              }
              placeholderTextColor={DS.textSecondary}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              onPress={detecterLots}
              disabled={!importTexte.trim()}
              style={[styles.detectBtn, !importTexte.trim() && { opacity: 0.5 }]}
            >
              <Wand2 size={14} color={DS.cremeFond} strokeWidth={2.5} />
              <Text style={styles.detectBtnText}>Détecter les lots</Text>
            </Pressable>

            {/* Liste lots détectés */}
            {lotsDetectes.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                  ✓ {lotsDetectes.length} lot{lotsDetectes.length > 1 ? 's' : ''} détecté{lotsDetectes.length > 1 ? 's' : ''} — sélectionne ceux à importer
                </Text>
                <ScrollView style={{ maxHeight: 200, marginTop: 4 }}>
                  {lotsDetectes.map((l, i) => (
                    <Pressable
                      key={i}
                      onPress={() => toggleLotSel(i)}
                      style={styles.detectedRow}
                    >
                      <View style={[styles.checkbox, lotsSelection[i] && styles.checkboxChecked]}>
                        {lotsSelection[i] && <Text style={styles.checkboxIcon}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detectedNom}>{l.nom}</Text>
                      </View>
                      <Text style={styles.detectedMontant}>
                        {l.montantHT > 0 ? `${fmt(l.montantHT)} €` : '—'}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowImport(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={importerLots}
                disabled={lotsDetectes.length === 0}
                style={[styles.saveBtn, lotsDetectes.length === 0 && { opacity: 0.5 }]}
              >
                <Text style={styles.saveBtnText}>
                  Importer ({lotsDetectes.filter((_, i) => lotsSelection[i]).length})
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal d'édition lot */}
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

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { Wand2 } from 'lucide-react-native';
import type { LotAvancement } from '@/app/types';
import { DS } from '@/constants/design';
import {
  extraireLotsAvecRemise,
  parseSaisieManuelle,
  type LotExtrait,
} from '@/lib/devisParser';

/**
 * ImportLotsDevisOverlay — Overlay (inline absolute, PAS un Modal RN) pour
 * importer les lots d'un chantier depuis un devis.
 *
 * Volontairement extrait d'AvancementLotsPanel + rendu en `position: absolute`
 * pour éviter le bug iOS de Modal-on-Modal (gesture handlers figés sur la
 * fenêtre parente après fermeture du Modal interne). Le parent doit le
 * rendre au niveau racine (à l'intérieur du Modal parent type "Marchés",
 * mais en dehors de tout ScrollView).
 */
export interface ImportLotsDevisOverlayProps {
  visible: boolean;
  onClose: () => void;
  /** Lots déjà présents (pour dédoublonner). */
  lotsActuels: LotAvancement[];
  /** Callback : les nouveaux lots à ajouter. Parent fait l'update. */
  onImport: (nouveauxLots: LotAvancement[]) => void;
  /** URL du devis PDF lié — active le mode "PDF auto". */
  devisUri?: string;
  /** Nom du fichier devis (affiché dans l'overlay). */
  devisNom?: string;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

export function ImportLotsDevisOverlay({
  visible,
  onClose,
  lotsActuels,
  onImport,
  devisUri,
  devisNom,
}: ImportLotsDevisOverlayProps) {
  const [importMode, setImportMode] = useState<'pdf' | 'coller' | 'rapide'>('coller');
  const [importTexte, setImportTexte] = useState('');
  const [lotsDetectes, setLotsDetectes] = useState<LotExtrait[]>([]);
  const [lotsSelection, setLotsSelection] = useState<Record<number, boolean>>({});
  const [pdfExtractLoading, setPdfExtractLoading] = useState(false);

  // Reset à chaque ouverture
  React.useEffect(() => {
    if (visible) {
      setImportMode(devisUri ? 'pdf' : 'coller');
      setImportTexte('');
      setLotsDetectes([]);
      setLotsSelection({});
      setPdfExtractLoading(false);
    }
  }, [visible, devisUri]);

  const extraireAutoDepuisPdf = async () => {
    if (!devisUri) {
      const msg = 'Aucun devis PDF lié à ce chantier. Uploadez-en un dans la section Marchés.';
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Pas de devis', msg);
      return;
    }
    setPdfExtractLoading(true);
    try {
      const { extractTextFromPdfUrl } = await import('@/lib/pdfExtract');
      const texte = await extractTextFromPdfUrl(devisUri);
      if (!texte) {
        const msg = "Impossible d'extraire le texte du PDF. Essayez le mode 'Coller texte devis'.";
        if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
        else Alert.alert('Extraction échouée', msg);
        return;
      }
      setImportTexte(texte);
      const { lots: detected, remiseHT, totalBrutHT } = extraireLotsAvecRemise(texte);
      setLotsDetectes(detected);
      const sel: Record<number, boolean> = {};
      detected.forEach((_, i) => { sel[i] = true; });
      setLotsSelection(sel);
      if (detected.length === 0) {
        const msg = `Texte extrait (${texte.length} caractères) mais aucun lot détecté. Passez en mode "Coller texte devis" pour ajuster.`;
        if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
        else Alert.alert('Aucun lot détecté', msg);
      } else if (remiseHT > 0) {
        const msg = `✓ ${detected.length} lots détectés\n🎯 Remise de ${remiseHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT ventilée au prorata (total brut ${totalBrutHT.toLocaleString('fr-FR')} €)`;
        if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
        else Alert.alert('Extraction', msg);
      }
    } catch (e) {
      const msg = "Erreur lors de l'extraction. Essayez le mode 'Coller texte devis'.";
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Erreur', msg);
    } finally {
      setPdfExtractLoading(false);
    }
  };

  const detecterLots = () => {
    let detected: LotExtrait[];
    let remiseInfo: { remiseHT: number; totalBrutHT: number } | null = null;
    if (importMode === 'coller') {
      const r = extraireLotsAvecRemise(importTexte);
      detected = r.lots;
      if (r.remiseHT > 0) remiseInfo = { remiseHT: r.remiseHT, totalBrutHT: r.totalBrutHT };
    } else {
      detected = parseSaisieManuelle(importTexte);
    }
    setLotsDetectes(detected);
    const sel: Record<number, boolean> = {};
    detected.forEach((_, i) => { sel[i] = true; });
    setLotsSelection(sel);
    if (detected.length === 0) {
      const msg = 'Aucun lot détecté. Vérifiez que le texte contient bien des lignes avec un nom et un montant.';
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Aucun lot détecté', msg);
    } else if (remiseInfo) {
      const msg = `✓ ${detected.length} lots détectés\n🎯 Remise de ${remiseInfo.remiseHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT ventilée au prorata`;
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Extraction', msg);
    }
  };

  const importerLots = () => {
    const aImporter = lotsDetectes.filter((_, i) => lotsSelection[i]);
    if (aImporter.length === 0) return;
    const nomsExistants = new Set(lotsActuels.map(c => c.nom.toLowerCase().trim()));
    const nouveaux: LotAvancement[] = aImporter
      .filter(l => !nomsExistants.has(l.nom.toLowerCase().trim()))
      .map(l => ({
        id: genId('lot'),
        nom: l.nom,
        montant: l.montantHT,
        pourcentage: 0,
        updatedAt: new Date().toISOString(),
      }));
    if (nouveaux.length === 0) {
      const msg = 'Tous les lots sélectionnés existent déjà.';
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Rien à importer', msg);
      return;
    }
    onImport(nouveaux);
    onClose();
  };

  const toggleLotSel = (i: number) => {
    setLotsSelection(prev => ({ ...prev, [i]: !prev[i] }));
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Backdrop tappable pour fermer */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet centrée */}
      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={{ padding: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>🤖 Importer les lots depuis le devis</Text>

          {/* Choix mode */}
          <View style={styles.modeRow}>
            {devisUri && (
              <Pressable
                onPress={() => { setImportMode('pdf'); setLotsDetectes([]); }}
                style={[styles.modeChip, importMode === 'pdf' && styles.modeChipActive]}
              >
                <Text style={[styles.modeChipText, importMode === 'pdf' && styles.modeChipTextActive]}>
                  🤖 PDF auto
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setImportMode('coller')}
              style={[styles.modeChip, importMode === 'coller' && styles.modeChipActive]}
            >
              <Text style={[styles.modeChipText, importMode === 'coller' && styles.modeChipTextActive]}>
                📋 Coller texte
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setImportMode('rapide')}
              style={[styles.modeChip, importMode === 'rapide' && styles.modeChipActive]}
            >
              <Text style={[styles.modeChipText, importMode === 'rapide' && styles.modeChipTextActive]}>
                ⚡ Saisie
              </Text>
            </Pressable>
          </View>

          {importMode === 'pdf' ? (
            <>
              <Text style={styles.fieldLabel}>
                🤖 Extraction automatique depuis le devis PDF lié à ce chantier
              </Text>
              <View style={styles.pdfInfoBox}>
                <Text style={styles.pdfInfoText} numberOfLines={2}>
                  📄 {devisNom || 'Devis lié à ce chantier'}
                </Text>
              </View>
              <Pressable
                onPress={extraireAutoDepuisPdf}
                disabled={pdfExtractLoading}
                style={[styles.detectBtn, pdfExtractLoading && { opacity: 0.5 }]}
              >
                <Wand2 size={14} color={DS.cremeFond} strokeWidth={2.5} />
                <Text style={styles.detectBtnText}>
                  {pdfExtractLoading ? '⏳ Analyse en cours…' : '🤖 Analyser le devis PDF'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
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
            </>
          )}

          {lotsDetectes.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                ✓ {lotsDetectes.length} lot{lotsDetectes.length > 1 ? 's' : ''} détecté{lotsDetectes.length > 1 ? 's' : ''} — sélectionne ceux à importer
              </Text>
              <View style={{ maxHeight: 240, marginTop: 4 }}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {lotsDetectes.map((l, i) => (
                    <Pressable key={i} onPress={() => toggleLotSel(i)} style={styles.detectedRow}>
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
              </View>
            </>
          )}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
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
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: DS.surface,
    borderRadius: 16,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: DS.sombre,
    marginBottom: 12,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
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
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.textSecondary,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
    marginBottom: 4,
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
  actions: {
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

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, Alert, Platform,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import {
  PIECES_DEFAULT,
  PV_LOT_LABELS,
  getLotsByPieceName,
  type PVPiece,
  type PVPieceLot,
} from '@/app/types';
import { genererNumeroPV } from '@/lib/pv/genererNumeroPV';
import { todayYMD } from '@/lib/date/today';

interface Props {
  chantier: Chantier;
  isAdmin: boolean;
  onClose?: () => void;
}

/**
 * PV de réception V2 — structure pièces + lots.
 * Affiché quand chantier.pvReception?.pieces existe (nouveau format).
 * Les anciens PV avec items[] continuent d'être affichés par
 * PVReceptionChantier (legacy).
 */
export function PVReceptionChantierV2({ chantier, isAdmin, onClose }: Props) {
  const { data, upsertPVReception } = useApp();
  const pv = chantier.pvReception;
  const [pieces, setPieces] = useState<PVPiece[]>(pv?.pieces || []);
  const [dateReception, setDateReception] = useState<string>(pv?.dateReception || todayYMD());
  const numeroPV = pv?.numeroPV;
  const isClotured = !!pv?.clotureLe;

  // Sheet de sélection des pièces
  const [showPickerSheet, setShowPickerSheet] = useState(false);
  const [selectedNoms, setSelectedNoms] = useState<string[]>([]);
  const [persoInput, setPersoInput] = useState('');

  // Accordéon : 1 pièce dépliée à la fois
  const [expandedPieceId, setExpandedPieceId] = useState<string | null>(null);

  const togglePiece = (pieceId: string) => {
    setExpandedPieceId(prev => prev === pieceId ? null : pieceId);
  };

  // Modifier l'état conforme d'un lot
  const updateLotConforme = (pieceId: string, lotId: string, conforme: boolean | null) => {
    const updatedPieces = pieces.map(piece => {
      if (piece.id !== pieceId) return piece;
      const updatedLots = piece.lots.map(lot => {
        if (lot.id !== lotId) return lot;
        // On préserve le commentaire (l'admin peut re-toggle)
        return { ...lot, conforme };
      });
      return { ...piece, lots: updatedLots };
    });
    setPieces(updatedPieces);
    upsertPVReception(chantier.id, {
      ...(pv || {}),
      numeroPV: numeroPV || genererNumeroPV(data.chantiers),
      dateReception,
      pieces: updatedPieces,
    });
  };

  // Modifier le commentaire de réserve d'un lot
  const updateLotReserve = (pieceId: string, lotId: string, reserve: string) => {
    const updatedPieces = pieces.map(piece => {
      if (piece.id !== pieceId) return piece;
      const updatedLots = piece.lots.map(lot => {
        if (lot.id !== lotId) return lot;
        return { ...lot, reserve };
      });
      return { ...piece, lots: updatedLots };
    });
    setPieces(updatedPieces);
    upsertPVReception(chantier.id, {
      ...(pv || {}),
      numeroPV: numeroPV || genererNumeroPV(data.chantiers),
      dateReception,
      pieces: updatedPieces,
    });
  };

  // Init automatique au mount admin pour un chantier qui n'a pas encore
  // de structure pieces[] (rétrocompat : on préserve pv.items legacy).
  useEffect(() => {
    if (isAdmin && !pv?.pieces) {
      upsertPVReception(chantier.id, {
        ...(pv || {}),
        pieces: [],
        dateReception: pv?.dateReception || todayYMD(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDraft = () => {
    const newNumero = numeroPV || genererNumeroPV(data.chantiers);
    upsertPVReception(chantier.id, {
      ...(pv || {}),
      numeroPV: newNumero,
      dateReception,
      pieces,
    });
  };

  // Toggle une pièce dans la sélection (sheet)
  const toggleSelected = (nom: string) => {
    setSelectedNoms(prev =>
      prev.includes(nom) ? prev.filter(n => n !== nom) : [...prev, nom]
    );
  };

  // Ajouter la pièce perso au catalogue de sélection
  const addPersoToSelection = () => {
    const nom = persoInput.trim();
    if (!nom) return;
    if (selectedNoms.includes(nom)) {
      Alert.alert('Doublon', `"${nom}" est déjà dans votre sélection.`);
      return;
    }
    const existsInPieces = pieces.some(p => p.nom.toLowerCase() === nom.toLowerCase());
    if (existsInPieces) {
      Alert.alert('Pièce déjà ajoutée', `"${nom}" est déjà dans le PV.`);
      return;
    }
    setSelectedNoms(prev => [...prev, nom]);
    setPersoInput('');
  };

  // Confirmer la sélection : ajouter toutes les pièces cochées au PV
  const confirmAddPieces = () => {
    if (selectedNoms.length === 0) {
      setShowPickerSheet(false);
      return;
    }

    // Ne pas ajouter une pièce qui existe déjà
    const newPieces: PVPiece[] = selectedNoms
      .filter(nom => !pieces.some(p => p.nom.toLowerCase() === nom.toLowerCase()))
      .map((nom, i) => {
        const lotsTypes = getLotsByPieceName(nom);
        const lots: PVPieceLot[] = lotsTypes.map(type => ({
          id: `lot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${type}`,
          type,
          conforme: null,
        }));
        return {
          id: `piece_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`,
          nom,
          ordre: pieces.length + i,
          lots,
        };
      });

    if (newPieces.length === 0) {
      setShowPickerSheet(false);
      setSelectedNoms([]);
      return;
    }

    const updatedPieces = [...pieces, ...newPieces];
    setPieces(updatedPieces);

    // Auto-save pour persister immédiatement
    upsertPVReception(chantier.id, {
      ...(pv || {}),
      numeroPV: numeroPV || genererNumeroPV(data.chantiers),
      dateReception,
      pieces: updatedPieces,
    });

    setShowPickerSheet(false);
    setSelectedNoms([]);
    setPersoInput('');
  };

  // Retirer une pièce du PV (avec confirmation)
  const removePiece = (pieceId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    const doDelete = () => {
      const updatedPieces = pieces.filter(p => p.id !== pieceId);
      setPieces(updatedPieces);
      upsertPVReception(chantier.id, {
        ...(pv || {}),
        pieces: updatedPieces,
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Retirer "${piece.nom}" du PV ?`)) doDelete();
    } else {
      Alert.alert(
        'Retirer la pièce',
        `Retirer "${piece.nom}" du PV ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Retirer', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // Réinitialiser la sheet à l'ouverture
  const openPickerSheet = () => {
    setSelectedNoms([]);
    setPersoInput('');
    setShowPickerSheet(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📋 PV de réception</Text>
          {numeroPV
            ? <Text style={styles.numeroPV}>{numeroPV}</Text>
            : <Text style={styles.numeroPV}>Numéro auto-généré à la sauvegarde</Text>}
        </View>
        {onClose && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={styles.closeBtnPressable}
          >
            <Text style={styles.closeBtn}>✕</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>📅 Date de réception</Text>
          <Text style={styles.infoValue}>
            {dateReception ? dateReception.split('-').reverse().join('/') : '—'}
          </Text>
        </View>

        {pieces.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>PV vide</Text>
            <Text style={styles.emptyText}>
              {isAdmin
                ? 'Ajoutez les pièces du chantier pour commencer.'
                : 'Aucun élément à afficher pour le moment.'}
            </Text>
            {isAdmin && !isClotured && (
              <Pressable
                onPress={openPickerSheet}
                style={[styles.btn, styles.btnPrimary, { marginTop: 20, alignSelf: 'stretch' }]}
                accessibilityRole="button"
              >
                <Text style={styles.btnPrimaryText}>+ Ajouter des pièces</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View>
            <View style={styles.piecesHeader}>
              <Text style={styles.piecesTitle}>
                🏠 {pieces.length} pièce{pieces.length > 1 ? 's' : ''}
              </Text>
              {isAdmin && !isClotured && (
                <Pressable onPress={openPickerSheet} style={styles.addPiecesBtn}>
                  <Text style={styles.addPiecesBtnText}>+ Ajouter</Text>
                </Pressable>
              )}
            </View>

            {pieces.map(piece => {
              const isExpanded = expandedPieceId === piece.id;
              const lotsLabels = piece.lots.map(l =>
                l.libelle || PV_LOT_LABELS[l.type]
              ).join(' • ');
              const conformes = piece.lots.filter(l => l.conforme === true).length;
              const reserves = piece.lots.filter(l => l.conforme === false).length;
              const noncontroles = piece.lots.filter(l => l.conforme === null).length;

              return (
                <View key={piece.id} style={styles.pieceCard}>
                  {/* Header de la pièce — clickable pour toggle */}
                  <Pressable
                    onPress={() => togglePiece(piece.id)}
                    style={styles.pieceCardHeader}
                    accessibilityRole="button"
                    accessibilityLabel={`${piece.nom}, ${isExpanded ? 'plier' : 'déplier'}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pieceNom}>
                        {isExpanded ? '▼' : '▶'} {piece.nom}
                      </Text>
                      {!isExpanded && (
                        <Text style={styles.pieceLotsList} numberOfLines={2}>
                          {lotsLabels || 'Aucun lot'}
                        </Text>
                      )}
                      <View style={styles.pieceStats}>
                        {conformes > 0 && (
                          <Text style={[styles.pieceStat, { color: '#27AE60' }]}>
                            ✓ {conformes}
                          </Text>
                        )}
                        {reserves > 0 && (
                          <Text style={[styles.pieceStat, { color: '#E74C3C' }]}>
                            🔴 {reserves}
                          </Text>
                        )}
                        {noncontroles > 0 && (
                          <Text style={[styles.pieceStat, { color: '#687076' }]}>
                            ? {noncontroles}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isAdmin && !isClotured && (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          removePiece(piece.id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Retirer ${piece.nom}`}
                        hitSlop={8}
                      >
                        <Text style={styles.pieceRemoveBtn}>🗑</Text>
                      </Pressable>
                    )}
                  </Pressable>

                  {/* Body de la pièce — visible si expanded */}
                  {isExpanded && (
                    <View style={styles.pieceBody}>
                      {piece.lots.length === 0 ? (
                        <Text style={styles.pieceLotsEmpty}>
                          Aucun lot dans cette pièce.
                        </Text>
                      ) : (
                        piece.lots.map(lot => {
                          const labelLot = lot.libelle || PV_LOT_LABELS[lot.type];
                          const isConforme = lot.conforme === true;
                          const isReserve = lot.conforme === false;
                          const isNonControle = lot.conforme === null;

                          return (
                            <View key={lot.id} style={styles.lotCard}>
                              <Text style={styles.lotLabel}>{labelLot}</Text>

                              {/* Chips 3 états */}
                              {isAdmin && !isClotured ? (
                                <View style={styles.chipsRow}>
                                  <Pressable
                                    onPress={() => updateLotConforme(piece.id, lot.id, true)}
                                    style={[styles.chip, isConforme && styles.chipConforme]}
                                    accessibilityRole="button"
                                    accessibilityLabel="Marquer conforme"
                                    accessibilityState={{ selected: isConforme }}
                                  >
                                    <Text style={[styles.chipText, isConforme && styles.chipTextActive]}>
                                      ✓ Conforme
                                    </Text>
                                  </Pressable>

                                  <Pressable
                                    onPress={() => updateLotConforme(piece.id, lot.id, false)}
                                    style={[styles.chip, isReserve && styles.chipReserve]}
                                    accessibilityRole="button"
                                    accessibilityLabel="Marquer réserve"
                                    accessibilityState={{ selected: isReserve }}
                                  >
                                    <Text style={[styles.chipText, isReserve && styles.chipTextActive]}>
                                      🔴 Réserve
                                    </Text>
                                  </Pressable>

                                  <Pressable
                                    onPress={() => updateLotConforme(piece.id, lot.id, null)}
                                    style={[styles.chip, isNonControle && styles.chipNonControle]}
                                    accessibilityRole="button"
                                    accessibilityLabel="Non contrôlé"
                                    accessibilityState={{ selected: isNonControle }}
                                  >
                                    <Text style={[styles.chipText, isNonControle && styles.chipTextActive]}>
                                      ? Non
                                    </Text>
                                  </Pressable>
                                </View>
                              ) : (
                                /* Mode lecture seule (client ou clôturé) */
                                <View style={styles.chipsRow}>
                                  {isConforme && (
                                    <View style={[styles.chip, styles.chipConforme]}>
                                      <Text style={[styles.chipText, styles.chipTextActive]}>✓ Conforme</Text>
                                    </View>
                                  )}
                                  {isReserve && (
                                    <View style={[styles.chip, styles.chipReserve]}>
                                      <Text style={[styles.chipText, styles.chipTextActive]}>🔴 Réserve</Text>
                                    </View>
                                  )}
                                  {isNonControle && (
                                    <View style={[styles.chip, styles.chipNonControle]}>
                                      <Text style={[styles.chipText, styles.chipTextActive]}>? Non contrôlé</Text>
                                    </View>
                                  )}
                                </View>
                              )}

                              {/* TextInput réserve : visible UNIQUEMENT si état Réserve */}
                              {isReserve && (
                                <View style={styles.reserveInputBox}>
                                  <Text style={styles.reserveLabel}>📝 Description de la réserve</Text>
                                  {isAdmin && !isClotured ? (
                                    <TextInput
                                      style={styles.reserveInput}
                                      value={lot.reserve || ''}
                                      onChangeText={text => updateLotReserve(piece.id, lot.id, text)}
                                      placeholder="Décrivez le défaut constaté..."
                                      placeholderTextColor="#9DA6B0"
                                      multiline
                                      textAlignVertical="top"
                                      numberOfLines={3}
                                    />
                                  ) : (
                                    <Text style={styles.reserveDisplay}>
                                      {lot.reserve || '—'}
                                    </Text>
                                  )}
                                  {/* Photos seront ajoutées en PV-3c.2 */}
                                </View>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {isAdmin && !isClotured && pieces.length > 0 && (
          <View style={styles.actionsRow}>
            <Pressable
              onPress={saveDraft}
              style={[styles.btn, styles.btnPrimary]}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>💾 Sauvegarder</Text>
            </Pressable>
          </View>
        )}

        {isClotured && (
          <View style={styles.cloturedBadge}>
            <Text style={styles.cloturedText}>
              ✅ PV clôturé le {pv?.clotureLe ? new Date(pv.clotureLe).toLocaleDateString('fr-FR') : '—'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sheet de sélection des pièces */}
      <Modal
        visible={showPickerSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPickerSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setShowPickerSheet(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Pièces du chantier</Text>
              <Pressable
                onPress={() => setShowPickerSheet(false)}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
              >
                <Text style={styles.sheetClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetContent}>
              <Text style={styles.sheetSubtitle}>
                Cochez les pièces à ajouter ({selectedNoms.length} sélectionnée{selectedNoms.length > 1 ? 's' : ''})
              </Text>

              {/* Catalogue PIECES_DEFAULT — exclure les pièces déjà dans pieces[] */}
              {PIECES_DEFAULT
                .filter(nom => !pieces.some(p => p.nom.toLowerCase() === nom.toLowerCase()))
                .map(nom => {
                  const isSelected = selectedNoms.includes(nom);
                  return (
                    <Pressable
                      key={nom}
                      onPress={() => toggleSelected(nom)}
                      style={[styles.sheetItem, isSelected && styles.sheetItemSelected]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <Text style={styles.sheetCheckbox}>
                        {isSelected ? '☑' : '☐'}
                      </Text>
                      <Text style={styles.sheetItemText}>{nom}</Text>
                    </Pressable>
                  );
                })}

              {/* Pièces personnalisées sélectionnées (hors catalogue) */}
              {selectedNoms
                .filter(nom => !(PIECES_DEFAULT as readonly string[]).includes(nom))
                .map(nom => (
                  <Pressable
                    key={`perso_${nom}`}
                    onPress={() => toggleSelected(nom)}
                    style={[styles.sheetItem, styles.sheetItemSelected]}
                  >
                    <Text style={styles.sheetCheckbox}>☑</Text>
                    <Text style={styles.sheetItemText}>{nom}</Text>
                    <Text style={styles.sheetItemPerso}>(perso)</Text>
                  </Pressable>
                ))}

              {/* Champ pièce personnalisée */}
              <View style={styles.persoBox}>
                <Text style={styles.persoLabel}>+ Ajouter une pièce personnalisée</Text>
                <View style={styles.persoRow}>
                  <TextInput
                    style={styles.persoInput}
                    value={persoInput}
                    onChangeText={setPersoInput}
                    placeholder='Ex: "Bureau Jean"'
                    placeholderTextColor="#9DA6B0"
                    returnKeyType="done"
                    onSubmitEditing={addPersoToSelection}
                  />
                  <Pressable
                    onPress={addPersoToSelection}
                    style={[styles.persoAddBtn, !persoInput.trim() && { opacity: 0.4 }]}
                    disabled={!persoInput.trim()}
                  >
                    <Text style={styles.persoAddBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            {/* Bouton confirmer */}
            <View style={styles.sheetFooter}>
              <Pressable
                onPress={confirmAddPieces}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  selectedNoms.length === 0 && { opacity: 0.5 },
                ]}
                disabled={selectedNoms.length === 0}
                accessibilityRole="button"
              >
                <Text style={styles.btnPrimaryText}>
                  Ajouter ({selectedNoms.length})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
  },
  numeroPV: {
    fontSize: 11,
    color: '#687076',
    marginTop: 2,
  },
  closeBtnPressable: {
    padding: 8,
  },
  closeBtn: {
    fontSize: 18,
    color: '#687076',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  infoCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 12,
    color: '#687076',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#11181C',
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: '#687076',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  // Header de la liste pieces (avec bouton + Ajouter)
  piecesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  piecesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
  },
  addPiecesBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F5EDE3',
    borderRadius: 8,
  },
  addPiecesBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#11181C',
  },
  // Cartes de pièces
  pieceCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pieceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pieceNom: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  pieceRemoveBtn: {
    fontSize: 16,
    padding: 4,
  },
  pieceLotsList: {
    fontSize: 11,
    color: '#687076',
    marginBottom: 6,
  },
  pieceStats: {
    flexDirection: 'row',
    gap: 12,
  },
  pieceStat: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Body de la pièce (accordéon expanded)
  pieceBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E6EA',
    gap: 12,
  },
  pieceLotsEmpty: {
    fontSize: 12,
    color: '#687076',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  // Carte de lot
  lotCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  lotLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#11181C',
    marginBottom: 10,
  },
  // Chips 3 états
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E6EA',
    backgroundColor: '#F8F9FA',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#687076',
  },
  chipTextActive: {
    color: '#fff',
  },
  chipConforme: {
    backgroundColor: '#27AE60',
    borderColor: '#27AE60',
  },
  chipReserve: {
    backgroundColor: '#E74C3C',
    borderColor: '#E74C3C',
  },
  chipNonControle: {
    backgroundColor: '#687076',
    borderColor: '#687076',
  },
  // TextInput réserve
  reserveInputBox: {
    marginTop: 10,
    backgroundColor: '#FEF6F6',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  reserveLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7F1D1D',
    marginBottom: 6,
  },
  reserveInput: {
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#11181C',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    minHeight: 60,
  },
  reserveDisplay: {
    fontSize: 13,
    color: '#11181C',
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  btnPrimary: {
    backgroundColor: '#2C2C2C',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  cloturedBadge: {
    marginTop: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  cloturedText: {
    fontSize: 12,
    color: '#27AE60',
    fontWeight: '600',
  },
  // Sheet de sélection
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E6EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E6EA',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#11181C',
  },
  sheetClose: {
    fontSize: 18,
    color: '#687076',
    padding: 4,
  },
  sheetContent: {
    padding: 16,
    paddingBottom: 80, // espace pour le footer
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#687076',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    gap: 12,
  },
  sheetItemSelected: {
    backgroundColor: '#F5EDE3',
  },
  sheetCheckbox: {
    fontSize: 18,
    color: '#11181C',
  },
  sheetItemText: {
    fontSize: 14,
    color: '#11181C',
    flex: 1,
  },
  sheetItemPerso: {
    fontSize: 10,
    color: '#687076',
    fontStyle: 'italic',
  },
  persoBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E6EA',
  },
  persoLabel: {
    fontSize: 12,
    color: '#687076',
    marginBottom: 8,
    fontWeight: '600',
  },
  persoRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  persoInput: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E2E6EA',
    color: '#11181C',
  },
  persoAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2C2C2C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  persoAddBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  sheetFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E6EA',
  },
});

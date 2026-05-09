import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, Alert, Platform,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import {
  PIECES_DEFAULT,
  type PVPiece,
  type PVReserve,
  type PVLevee,
} from '@/app/types';
import { genererNumeroPV } from '@/lib/pv/genererNumeroPV';
import { todayYMD } from '@/lib/date/today';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { uploadFileToStorage } from '@/lib/supabase';
import { openDocPreview } from '@/lib/share/openDocPreview';

interface Props {
  chantier: Chantier;
  isAdmin: boolean;
  onClose?: () => void;
}

export function PVReceptionChantierV2({ chantier, isAdmin, onClose }: Props) {
  const { data, upsertPVReception } = useApp();
  const pv = chantier.pvReception;
  const [pieces, setPieces] = useState<PVPiece[]>(pv?.pieces || []);
  const [dateReception] = useState<string>(pv?.dateReception || todayYMD());
  const numeroPV = pv?.numeroPV;
  const isClotured = !!pv?.clotureLe;

  // Lots du devis (pour dropdown catégorie)
  const lotsDevis = chantier.avancementCorps || [];
  const hasDevisLots = lotsDevis.length > 0;

  // Sheet sélection pièces
  const [showPickerSheet, setShowPickerSheet] = useState(false);
  const [selectedNoms, setSelectedNoms] = useState<string[]>([]);
  const [persoInput, setPersoInput] = useState('');

  // Accordéon : 1 pièce dépliée à la fois
  const [expandedPieceId, setExpandedPieceId] = useState<string | null>(null);

  // Modal d'édition d'une réserve (création OU édition)
  const [editingReserve, setEditingReserve] = useState<{
    pieceId: string;
    reserve: PVReserve | null; // null = création
  } | null>(null);

  // Init automatique au mount admin
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

  // ──────────── Helper de persistance ────────────
  const persistPieces = (updatedPieces: PVPiece[]) => {
    setPieces(updatedPieces);
    upsertPVReception(chantier.id, {
      ...(pv || {}),
      numeroPV: numeroPV || genererNumeroPV(data.chantiers),
      dateReception,
      pieces: updatedPieces,
    });
  };

  // ──────────── Handlers pièces ────────────
  const togglePiece = (pieceId: string) => {
    setExpandedPieceId(prev => prev === pieceId ? null : pieceId);
  };

  const toggleSelected = (nom: string) => {
    setSelectedNoms(prev =>
      prev.includes(nom) ? prev.filter(n => n !== nom) : [...prev, nom]
    );
  };

  const addPersoToSelection = () => {
    const nom = persoInput.trim();
    if (!nom) return;
    if (selectedNoms.includes(nom)) {
      Alert.alert('Doublon', `"${nom}" est déjà dans votre sélection.`);
      return;
    }
    if (pieces.some(p => p.nom.toLowerCase() === nom.toLowerCase())) {
      Alert.alert('Pièce déjà ajoutée', `"${nom}" est déjà dans le PV.`);
      return;
    }
    setSelectedNoms(prev => [...prev, nom]);
    setPersoInput('');
  };

  const confirmAddPieces = () => {
    if (selectedNoms.length === 0) {
      setShowPickerSheet(false);
      return;
    }
    const newPieces: PVPiece[] = selectedNoms
      .filter(nom => !pieces.some(p => p.nom.toLowerCase() === nom.toLowerCase()))
      .map((nom, i) => ({
        id: `piece_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`,
        nom,
        ordre: pieces.length + i,
        reserves: [],
      }));
    if (newPieces.length === 0) {
      setShowPickerSheet(false);
      setSelectedNoms([]);
      return;
    }
    persistPieces([...pieces, ...newPieces]);
    setShowPickerSheet(false);
    setSelectedNoms([]);
    setPersoInput('');
  };

  const removePiece = (pieceId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    const doDelete = () => {
      persistPieces(pieces.filter(p => p.id !== pieceId));
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Retirer "${piece.nom}" du PV ?`)) doDelete();
    } else {
      Alert.alert('Retirer la pièce', `Retirer "${piece.nom}" du PV ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const openPickerSheet = () => {
    setSelectedNoms([]);
    setPersoInput('');
    setShowPickerSheet(true);
  };

  // ──────────── Handlers réserves ────────────
  const openReserveEditor = (pieceId: string, reserve: PVReserve | null) => {
    setEditingReserve({ pieceId, reserve });
  };

  const saveReserve = (
    pieceId: string,
    reserveData: Omit<PVReserve, 'id' | 'createdAt'>,
    existingId?: string,
  ) => {
    const updatedPieces = pieces.map(piece => {
      if (piece.id !== pieceId) return piece;
      const reserves = piece.reserves || [];
      if (existingId) {
        return {
          ...piece,
          reserves: reserves.map(r =>
            r.id === existingId ? { ...r, ...reserveData } : r
          ),
        };
      }
      const newReserve: PVReserve = {
        id: `reserve_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        ...reserveData,
      };
      return { ...piece, reserves: [...reserves, newReserve] };
    });
    persistPieces(updatedPieces);
    setEditingReserve(null);
  };

  const deleteReserve = (pieceId: string, reserveId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    const reserve = piece?.reserves.find(r => r.id === reserveId);
    if (!reserve) return;
    const doDelete = () => {
      const updatedPieces = pieces.map(p =>
        p.id !== pieceId ? p : { ...p, reserves: p.reserves.filter(r => r.id !== reserveId) }
      );
      persistPieces(updatedPieces);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer la réserve "${reserve.description}" ?`)) doDelete();
    } else {
      Alert.alert('Supprimer la réserve', `Supprimer "${reserve.description}" ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const toggleLevee = (pieceId: string, reserveId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    const reserve = piece?.reserves.find(r => r.id === reserveId);
    if (!reserve) return;
    if (reserve.levee) {
      const doUncheck = () => {
        const updatedPieces = pieces.map(p =>
          p.id !== pieceId ? p : {
            ...p,
            reserves: p.reserves.map(r =>
              r.id === reserveId ? { ...r, levee: undefined } : r
            ),
          }
        );
        persistPieces(updatedPieces);
      };
      if (Platform.OS === 'web') {
        if (window.confirm('Annuler la levée de cette réserve ?')) doUncheck();
      } else {
        Alert.alert('Annuler la levée', 'Annuler la levée de cette réserve ?', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', onPress: doUncheck },
        ]);
      }
    } else {
      const newLevee: PVLevee = { le: new Date().toISOString() };
      const updatedPieces = pieces.map(p =>
        p.id !== pieceId ? p : {
          ...p,
          reserves: p.reserves.map(r =>
            r.id === reserveId ? { ...r, levee: newLevee } : r
          ),
        }
      );
      persistPieces(updatedPieces);
    }
  };

  const addPhotoLevee = async (pieceId: string, reserveId: string) => {
    try {
      const files = await pickNativeFile({
        acceptImages: true,
        acceptCamera: true,
        multiple: false,
        compressImages: true,
      });
      if (!files || files.length === 0) return;
      const url = await uploadFileToStorage(
        files[0].uri,
        `chantiers/${chantier.id}/pv-reserves`,
        `levee_${reserveId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      );
      if (!url) {
        Alert.alert('Erreur', "Impossible d'uploader la photo");
        return;
      }
      const updatedPieces = pieces.map(p =>
        p.id !== pieceId ? p : {
          ...p,
          reserves: p.reserves.map(r => {
            if (r.id !== reserveId || !r.levee) return r;
            const photos = [...(r.levee.photos || []), url].slice(0, 5);
            return { ...r, levee: { ...r.levee, photos } };
          }),
        }
      );
      persistPieces(updatedPieces);
    } catch (err) {
      console.error('Upload photo levée échoué', err);
      Alert.alert('Erreur', "Impossible d'ajouter la photo");
    }
  };

  const removePhotoLevee = (pieceId: string, reserveId: string, photoUrl: string) => {
    const updatedPieces = pieces.map(p =>
      p.id !== pieceId ? p : {
        ...p,
        reserves: p.reserves.map(r => {
          if (r.id !== reserveId || !r.levee) return r;
          return {
            ...r,
            levee: {
              ...r.levee,
              photos: (r.levee.photos || []).filter(u => u !== photoUrl),
            },
          };
        }),
      }
    );
    persistPieces(updatedPieces);
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
              const reserves = piece.reserves || [];
              const nbATraiter = reserves.filter(r => !r.levee).length;
              const nbLevees = reserves.filter(r => !!r.levee).length;

              return (
                <View key={piece.id} style={styles.pieceCard}>
                  <Pressable
                    onPress={() => togglePiece(piece.id)}
                    style={styles.pieceCardHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pieceNom}>
                        {isExpanded ? '▼' : '▶'} {piece.nom}
                      </Text>
                      <View style={styles.pieceStats}>
                        {nbATraiter > 0 && (
                          <Text style={[styles.pieceStat, { color: '#E74C3C' }]}>
                            🔴 {nbATraiter} à traiter
                          </Text>
                        )}
                        {nbLevees > 0 && (
                          <Text style={[styles.pieceStat, { color: '#27AE60' }]}>
                            ✓ {nbLevees} levée{nbLevees > 1 ? 's' : ''}
                          </Text>
                        )}
                        {reserves.length === 0 && (
                          <Text style={[styles.pieceStat, { color: '#27AE60' }]}>
                            ✓ Aucune réserve
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

                  {isExpanded && (
                    <View style={styles.pieceBody}>
                      {reserves.length === 0 ? (
                        <Text style={styles.emptyReserves}>
                          Aucune réserve dans cette pièce.
                        </Text>
                      ) : (
                        reserves.map(reserve => {
                          const isLevee = !!reserve.levee;
                          const categorie = reserve.lotDevisNomSnapshot || reserve.categorieLibre;
                          return (
                            <View
                              key={reserve.id}
                              style={[styles.reserveCard, isLevee && styles.reserveCardLevee]}
                            >
                              <View style={styles.reserveHeader}>
                                {isAdmin && !isClotured ? (
                                  <Pressable
                                    onPress={() => toggleLevee(piece.id, reserve.id)}
                                    style={styles.checkbox}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: isLevee }}
                                  >
                                    <Text style={styles.checkboxIcon}>
                                      {isLevee ? '✅' : '⬜'}
                                    </Text>
                                  </Pressable>
                                ) : (
                                  <Text style={styles.checkboxIcon}>
                                    {isLevee ? '✅' : '⬜'}
                                  </Text>
                                )}
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={[
                                      styles.reserveDescription,
                                      isLevee && styles.reserveDescriptionLevee,
                                    ]}
                                  >
                                    {reserve.description}
                                  </Text>
                                  {categorie && (
                                    <Text style={styles.reserveCategorie}>
                                      📂 {categorie}
                                    </Text>
                                  )}
                                </View>
                                {isAdmin && !isClotured && (
                                  <View style={{ flexDirection: 'row', gap: 4 }}>
                                    <Pressable
                                      onPress={() => openReserveEditor(piece.id, reserve)}
                                      hitSlop={8}
                                    >
                                      <Text style={styles.reserveActionBtn}>✏️</Text>
                                    </Pressable>
                                    <Pressable
                                      onPress={() => deleteReserve(piece.id, reserve.id)}
                                      hitSlop={8}
                                    >
                                      <Text style={styles.reserveActionBtn}>🗑</Text>
                                    </Pressable>
                                  </View>
                                )}
                              </View>

                              {/* Photos initiales (constat) */}
                              {reserve.photos && reserve.photos.length > 0 && (
                                <View style={styles.photosBlock}>
                                  <Text style={styles.photosLabel}>📷 Constat ({reserve.photos.length})</Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View style={styles.photosRow}>
                                      {reserve.photos.map((url, i) => (
                                        <Pressable
                                          key={url + i}
                                          onPress={() => openDocPreview(url)}
                                          style={styles.photoThumb}
                                        >
                                          <Text style={styles.photoEmoji}>📷</Text>
                                        </Pressable>
                                      ))}
                                    </View>
                                  </ScrollView>
                                </View>
                              )}

                              {/* Photos de levée */}
                              {isLevee && reserve.levee && (
                                <View style={styles.photosBlock}>
                                  <Text style={styles.photosLabel}>
                                    ✅ Levée le {new Date(reserve.levee.le).toLocaleDateString('fr-FR')}
                                    {reserve.levee.photos && reserve.levee.photos.length > 0
                                      ? ` (${reserve.levee.photos.length} photo${reserve.levee.photos.length > 1 ? 's' : ''})`
                                      : ''}
                                  </Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View style={styles.photosRow}>
                                      {(reserve.levee.photos || []).map((url, i) => (
                                        <View key={url + i} style={styles.photoThumbWrap}>
                                          <Pressable
                                            onPress={() => openDocPreview(url)}
                                            style={[styles.photoThumb, { backgroundColor: '#E8F5E9' }]}
                                          >
                                            <Text style={styles.photoEmoji}>📷</Text>
                                          </Pressable>
                                          {isAdmin && !isClotured && (
                                            <Pressable
                                              onPress={() => removePhotoLevee(piece.id, reserve.id, url)}
                                              style={styles.photoRemove}
                                              hitSlop={4}
                                            >
                                              <Text style={styles.photoRemoveText}>✕</Text>
                                            </Pressable>
                                          )}
                                        </View>
                                      ))}
                                      {isAdmin && !isClotured && (reserve.levee.photos?.length || 0) < 5 && (
                                        <Pressable
                                          onPress={() => addPhotoLevee(piece.id, reserve.id)}
                                          style={[styles.photoThumb, styles.photoAddBtn]}
                                        >
                                          <Text style={styles.photoAddText}>+</Text>
                                        </Pressable>
                                      )}
                                    </View>
                                  </ScrollView>
                                </View>
                              )}
                            </View>
                          );
                        })
                      )}

                      {isAdmin && !isClotured && (
                        <Pressable
                          onPress={() => openReserveEditor(piece.id, null)}
                          style={styles.addReserveBtn}
                        >
                          <Text style={styles.addReserveBtnText}>+ Ajouter une réserve</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
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

      {/* Sheet sélection pièces */}
      <Modal
        visible={showPickerSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPickerSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPickerSheet(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Pièces du chantier</Text>
              <Pressable onPress={() => setShowPickerSheet(false)} hitSlop={8}>
                <Text style={styles.sheetClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <Text style={styles.sheetSubtitle}>
                Cochez les pièces à ajouter ({selectedNoms.length} sélectionnée{selectedNoms.length > 1 ? 's' : ''})
              </Text>
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
                      <Text style={styles.sheetCheckbox}>{isSelected ? '☑' : '☐'}</Text>
                      <Text style={styles.sheetItemText}>{nom}</Text>
                    </Pressable>
                  );
                })}
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
            <View style={styles.sheetFooter}>
              <Pressable
                onPress={confirmAddPieces}
                style={[styles.btn, styles.btnPrimary, selectedNoms.length === 0 && { opacity: 0.5 }]}
                disabled={selectedNoms.length === 0}
              >
                <Text style={styles.btnPrimaryText}>Ajouter ({selectedNoms.length})</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal édition réserve */}
      {editingReserve && (
        <ReserveEditorModal
          chantierId={chantier.id}
          piece={pieces.find(p => p.id === editingReserve.pieceId)!}
          reserve={editingReserve.reserve}
          lotsDevis={lotsDevis}
          hasDevisLots={hasDevisLots}
          onSave={(d) => saveReserve(editingReserve.pieceId, d, editingReserve.reserve?.id)}
          onClose={() => setEditingReserve(null)}
        />
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Modal d'édition d'une réserve
// ════════════════════════════════════════════════════════════════

interface ReserveEditorModalProps {
  chantierId: string;
  piece: PVPiece;
  reserve: PVReserve | null;
  lotsDevis: Array<{ id: string; nom: string }>;
  hasDevisLots: boolean;
  onSave: (data: Omit<PVReserve, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

function ReserveEditorModal({
  chantierId,
  piece,
  reserve,
  lotsDevis,
  hasDevisLots,
  onSave,
  onClose,
}: ReserveEditorModalProps) {
  const [description, setDescription] = useState(reserve?.description || '');
  const [lotDevisId, setLotDevisId] = useState(reserve?.lotDevisId || '');
  const [categorieLibre, setCategorieLibre] = useState(reserve?.categorieLibre || '');
  const [photos, setPhotos] = useState<string[]>(reserve?.photos || []);

  const addPhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert('Limite atteinte', 'Maximum 5 photos par réserve.');
      return;
    }
    try {
      const files = await pickNativeFile({
        acceptImages: true,
        acceptCamera: true,
        multiple: false,
        compressImages: true,
      });
      if (!files || files.length === 0) return;
      const url = await uploadFileToStorage(
        files[0].uri,
        `chantiers/${chantierId}/pv-reserves`,
        `constat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      );
      if (!url) {
        Alert.alert('Erreur', "Impossible d'uploader la photo");
        return;
      }
      setPhotos(prev => [...prev, url]);
    } catch (err) {
      console.error('Upload photo réserve échoué', err);
      Alert.alert('Erreur', "Impossible d'ajouter la photo");
    }
  };

  const removePhoto = (url: string) => {
    setPhotos(prev => prev.filter(u => u !== url));
  };

  const handleSave = () => {
    const desc = description.trim();
    if (!desc) {
      Alert.alert('Description manquante', 'Décrivez la réserve avant de sauvegarder.');
      return;
    }

    const data: Omit<PVReserve, 'id' | 'createdAt'> = {
      description: desc,
      photos: photos.length > 0 ? photos : undefined,
      // Préserver la levée existante en cas d'édition
      levee: reserve?.levee,
    };

    if (lotDevisId && hasDevisLots) {
      const lot = lotsDevis.find(l => l.id === lotDevisId);
      data.lotDevisId = lotDevisId;
      data.lotDevisNomSnapshot = lot?.nom || '';
    } else if (categorieLibre.trim()) {
      data.categorieLibre = categorieLibre.trim();
    }

    onSave(data);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.editorOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.editorSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {reserve ? '✏️ Modifier la réserve' : '+ Nouvelle réserve'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.editorPieceLabel}>
            🏠 Pièce : {piece.nom}
          </Text>

          <ScrollView contentContainerStyle={styles.editorContent}>
            <Text style={styles.editorLabel}>Description *</Text>
            <TextInput
              style={styles.editorInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: Carrelage cassé dans le coin droit"
              placeholderTextColor="#9DA6B0"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {hasDevisLots ? (
              <>
                <Text style={styles.editorLabel}>Rattacher à un lot du devis (optionnel)</Text>
                <View style={styles.lotsList}>
                  <Pressable
                    onPress={() => { setLotDevisId(''); setCategorieLibre(''); }}
                    style={[styles.lotChip, !lotDevisId && !categorieLibre && styles.lotChipActive]}
                  >
                    <Text style={[styles.lotChipText, !lotDevisId && !categorieLibre && styles.lotChipTextActive]}>
                      Aucun
                    </Text>
                  </Pressable>
                  {lotsDevis.map(lot => {
                    const active = lotDevisId === lot.id;
                    return (
                      <Pressable
                        key={lot.id}
                        onPress={() => { setLotDevisId(lot.id); setCategorieLibre(''); }}
                        style={[styles.lotChip, active && styles.lotChipActive]}
                      >
                        <Text style={[styles.lotChipText, active && styles.lotChipTextActive]}>
                          {lot.nom}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => { setLotDevisId(''); }}
                    style={[styles.lotChip, !lotDevisId && !!categorieLibre && styles.lotChipActive]}
                  >
                    <Text style={[styles.lotChipText, !lotDevisId && !!categorieLibre && styles.lotChipTextActive]}>
                      ✏️ Autre
                    </Text>
                  </Pressable>
                </View>
                {!lotDevisId && (
                  <TextInput
                    style={[styles.editorInput, { marginTop: 8 }]}
                    value={categorieLibre}
                    onChangeText={setCategorieLibre}
                    placeholder="Catégorie libre (ex: Aménagement extérieur)"
                    placeholderTextColor="#9DA6B0"
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.editorLabel}>Catégorie (optionnel)</Text>
                <TextInput
                  style={styles.editorInput}
                  value={categorieLibre}
                  onChangeText={setCategorieLibre}
                  placeholder="Ex: Plomberie, Électricité, ..."
                  placeholderTextColor="#9DA6B0"
                />
              </>
            )}

            <Text style={styles.editorLabel}>📷 Photos du constat (optionnel, max 5)</Text>
            <View style={styles.photosRow}>
              {photos.map((url, i) => (
                <View key={url + i} style={styles.photoThumbWrap}>
                  <Pressable onPress={() => openDocPreview(url)} style={styles.photoThumb}>
                    <Text style={styles.photoEmoji}>📷</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removePhoto(url)}
                    style={styles.photoRemove}
                    hitSlop={4}
                  >
                    <Text style={styles.photoRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {photos.length < 5 && (
                <Pressable onPress={addPhoto} style={[styles.photoThumb, styles.photoAddBtn]}>
                  <Text style={styles.photoAddText}>+</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>

          <View style={styles.sheetFooter}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={onClose} style={[styles.btn, styles.btnSecondary]}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={[styles.btn, styles.btnPrimary]}>
                <Text style={styles.btnPrimaryText}>
                  {reserve ? 'Sauvegarder' : 'Ajouter'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
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
  pieceStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  pieceStat: {
    fontSize: 11,
    fontWeight: '600',
  },
  pieceBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E6EA',
    gap: 8,
  },
  // Réserves
  emptyReserves: {
    fontSize: 12,
    color: '#687076',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  reserveCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  reserveCardLevee: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  reserveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkbox: {
    paddingTop: 2,
  },
  checkboxIcon: {
    fontSize: 18,
  },
  reserveDescription: {
    fontSize: 13,
    color: '#11181C',
    fontWeight: '600',
  },
  reserveDescriptionLevee: {
    textDecorationLine: 'line-through',
    color: '#687076',
  },
  reserveCategorie: {
    fontSize: 11,
    color: '#687076',
    marginTop: 2,
  },
  reserveActionBtn: {
    fontSize: 14,
    padding: 4,
  },
  // Photos blocks
  photosBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E6EA',
  },
  photosLabel: {
    fontSize: 11,
    color: '#687076',
    marginBottom: 6,
    fontWeight: '600',
  },
  photosRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  photoThumbWrap: {
    position: 'relative',
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E6EA',
  },
  photoEmoji: {
    fontSize: 24,
  },
  photoRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E74C3C',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  photoAddBtn: {
    backgroundColor: '#F5EDE3',
    borderStyle: 'dashed',
  },
  photoAddText: {
    fontSize: 24,
    color: '#687076',
    fontWeight: '300',
  },
  // Bouton + Ajouter une réserve
  addReserveBtn: {
    marginTop: 8,
    paddingVertical: 10,
    backgroundColor: '#F5EDE3',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E6EA',
    borderStyle: 'dashed',
  },
  addReserveBtnText: {
    fontSize: 13,
    color: '#11181C',
    fontWeight: '600',
  },
  // Boutons
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
  btnSecondary: {
    backgroundColor: '#F5EDE3',
  },
  btnSecondaryText: {
    color: '#2C2C2C',
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
  // Sheet sélection pièces
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
    paddingBottom: 80,
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
  // Modal éditeur réserve
  editorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  editorSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  editorPieceLabel: {
    fontSize: 11,
    color: '#687076',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  editorContent: {
    padding: 16,
    paddingBottom: 100,
  },
  editorLabel: {
    fontSize: 12,
    color: '#687076',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  editorInput: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E2E6EA',
    color: '#11181C',
    minHeight: 44,
  },
  // Lots devis chips
  lotsList: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  lotChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E6EA',
    backgroundColor: '#F8F9FA',
  },
  lotChipActive: {
    backgroundColor: '#2C2C2C',
    borderColor: '#2C2C2C',
  },
  lotChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#687076',
  },
  lotChipTextActive: {
    color: '#fff',
  },
});

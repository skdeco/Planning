import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { useApp } from '@/app/context/AppContext';
import type { Chantier } from '@/app/types';
import type { PVPiece } from '@/app/types';
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
                ? 'Vous pourrez bientôt sélectionner les pièces du chantier (PV-3b).'
                : 'Aucun élément à afficher pour le moment.'}
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.placeholder}>
              {pieces.length} pièce{pieces.length > 1 ? 's' : ''} configurée{pieces.length > 1 ? 's' : ''} (PV-3c affichera les lots)
            </Text>
            {pieces.map(piece => (
              <View key={piece.id} style={styles.pieceCard}>
                <Text style={styles.pieceNom}>{piece.nom}</Text>
                <Text style={styles.pieceLots}>
                  {piece.lots.length} lot{piece.lots.length > 1 ? 's' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {isAdmin && !isClotured && (
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
  placeholder: {
    fontSize: 12,
    color: '#687076',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  pieceCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pieceNom: {
    fontSize: 14,
    fontWeight: '600',
    color: '#11181C',
  },
  pieceLots: {
    fontSize: 11,
    color: '#687076',
    marginTop: 2,
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
});

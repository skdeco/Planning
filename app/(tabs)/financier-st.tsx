import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/app/context/AppContext';
import { uploadFileToStorage } from '@/lib/supabase';

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function FinancierSTScreen() {
  const { data, currentUser, isHydrated, updateDevis, updateAcompteST } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !currentUser) router.replace('/login');
    if (isHydrated && currentUser && currentUser.role !== 'soustraitant') router.replace('/(tabs)/planning');
  }, [isHydrated, currentUser, router]);

  const stId = currentUser?.soustraitantId;
  // Tous les devis de ce ST, groupés par chantier
  const stDevis = data.devis.filter(d => d.soustraitantId === stId);

  // Grouper par chantier
  const devisByChantier: Record<string, typeof stDevis> = {};
  stDevis.forEach(d => {
    if (!devisByChantier[d.chantierId]) devisByChantier[d.chantierId] = [];
    devisByChantier[d.chantierId].push(d);
  });

  // ── Upload devis fichier par le ST ──
  const handleUploadDevisFichier = (devisId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const fileId = `devis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${stId}/devis`, fileId);
        const existing = data.devis.find(d => d.id === devisId);
        if (existing) updateDevis({ ...existing, devisFichier: storageUrl || base64 });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ── Upload facture par le ST pour un acompte ──
  const handleUploadFacture = (acompteId: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const fileId = `facture_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${stId}/factures`, fileId);
        const existing = data.acomptesst.find(a => a.id === acompteId);
        if (existing) updateAcompteST({ ...existing, facture: storageUrl || base64 });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const openDoc = (uri: string) => {
    if (Platform.OS === 'web') {
      const w = window.open();
      if (w) w.document.write(`<iframe src="${uri}" width="100%" height="100%"></iframe>`);
    }
  };

  const chantiersIds = Object.keys(devisByChantier);

  return (
    <ScreenContainer containerClassName="bg-[#F2F4F7]">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes finances</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {chantiersIds.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Aucun devis associé.</Text>
            <Text style={styles.emptyHint}>Contactez votre administrateur.</Text>
          </View>
        ) : (
          chantiersIds.map(chantierId => {
            const chantier = data.chantiers.find(c => c.id === chantierId);
            const devisList = devisByChantier[chantierId];
            const totalPrix = devisList.reduce((s, d) => s + d.prixConvenu, 0);
            const totalAcomptes = devisList.reduce((s, d) => {
              const acomptes = data.acomptesst.filter(a => a.devisId === d.id);
              return s + acomptes.reduce((sa, a) => sa + a.montant, 0);
            }, 0);
            const totalReste = totalPrix - totalAcomptes;

            return (
              <View key={chantierId} style={styles.chantierBlock}>
                {/* En-tête chantier */}
                <View style={styles.chantierHeader}>
                  <Text style={styles.chantierNom}>{chantier?.nom || 'Chantier inconnu'}</Text>
                  {chantier?.adresse ? <Text style={styles.chantierAdresse}>📍 {chantier.adresse}</Text> : null}
                </View>

                {/* Récapitulatif chantier */}
                <View style={styles.financeRow}>
                  <FinanceCell label="Total convenu" value={fmt(totalPrix)} color="#1A3A6B" />
                  <FinanceCell label="Reçu" value={fmt(totalAcomptes)} color="#E67E22" />
                  <FinanceCell label="Reste à recevoir" value={fmt(totalReste)} color={totalReste > 0 ? '#E74C3C' : '#27AE60'} />
                </View>

                {/* Devis individuels */}
                {devisList.map(devis => {
                  const acomptes = data.acomptesst.filter(a => a.devisId === devis.id);
                  const totalAcomptesDevis = acomptes.reduce((s, a) => s + a.montant, 0);
                  const resteDevis = devis.prixConvenu - totalAcomptesDevis;

                  return (
                    <View key={devis.id} style={styles.devisCard}>
                      {/* En-tête devis */}
                      <View style={styles.devisHeader}>
                        <View style={styles.devisObjetBadge}>
                          <Text style={styles.devisObjetText}>{devis.objet}</Text>
                        </View>
                        <Text style={styles.devisPrix}>{fmt(devis.prixConvenu)}</Text>
                      </View>

                      {/* Résumé financier devis */}
                      <View style={styles.devisFinanceRow}>
                        <View style={styles.devisFinanceCell}>
                          <Text style={styles.devisFinanceCellLabel}>Acomptes reçus</Text>
                          <Text style={[styles.devisFinanceCellValue, { color: '#E67E22' }]}>{fmt(totalAcomptesDevis)}</Text>
                        </View>
                        <View style={styles.devisFinanceCell}>
                          <Text style={styles.devisFinanceCellLabel}>Reste à recevoir</Text>
                          <Text style={[styles.devisFinanceCellValue, { color: resteDevis > 0 ? '#E74C3C' : '#27AE60' }]}>{fmt(resteDevis)}</Text>
                        </View>
                      </View>

                      {/* Documents devis */}
                      <View style={styles.devisDocsRow}>
                        {devis.devisFichier ? (
                          <Pressable style={styles.docBtn} onPress={() => openDoc(devis.devisFichier)}>
                            <Text style={styles.docBtnText}>📄 Mon devis</Text>
                          </Pressable>
                        ) : (
                          <Pressable style={[styles.docBtn, styles.docBtnUpload]} onPress={() => handleUploadDevisFichier(devis.id)}>
                            <Text style={styles.docBtnText}>⬆ Envoyer mon devis</Text>
                          </Pressable>
                        )}
                        {devis.devisSigne ? (
                          <Pressable style={[styles.docBtn, styles.docBtnSigne]} onPress={() => openDoc(devis.devisSigne)}>
                            <Text style={styles.docBtnText}>✅ Devis signé reçu</Text>
                          </Pressable>
                        ) : (
                          <View style={[styles.docBtn, styles.docBtnAttente]}>
                            <Text style={styles.docBtnTextGrey}>⏳ En attente de signature</Text>
                          </View>
                        )}
                      </View>

                      {/* Acomptes reçus */}
                      {acomptes.length > 0 && (
                        <View style={styles.acomptesSection}>
                          <Text style={styles.sectionTitle}>Acomptes reçus</Text>
                          {acomptes.map(a => (
                            <View key={a.id} style={styles.acompteRow}>
                              <View style={{ flex: 1 }}>
                                <View style={styles.acompteRowHeader}>
                                  <Text style={styles.acompteMontant}>{fmt(a.montant)}</Text>
                                  <Text style={styles.acompteDate}>{a.date}</Text>
                                </View>
                                {a.commentaire ? <Text style={styles.acompteComment}>{a.commentaire}</Text> : null}
                                {a.facture ? (
                                  <Pressable onPress={() => openDoc(a.facture)}>
                                    <Text style={styles.factureLink}>📄 Ma facture</Text>
                                  </Pressable>
                                ) : (
                                  <Pressable onPress={() => handleUploadFacture(a.id)}>
                                    <Text style={styles.factureUpload}>⬆ Joindre ma facture</Text>
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function FinanceCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.financeCell}>
      <Text style={styles.financeCellLabel}>{label}</Text>
      <Text style={[styles.financeCellValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#11181C' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#687076', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#B0BEC5', marginTop: 6 },
  emptySmall: { fontSize: 13, color: '#B0BEC5', paddingVertical: 8 },
  // Chantier block
  chantierBlock: { marginBottom: 20 },
  chantierHeader: { marginBottom: 10 },
  chantierNom: { fontSize: 20, fontWeight: '800', color: '#11181C' },
  chantierAdresse: { fontSize: 12, color: '#687076', marginTop: 2 },
  financeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  financeCell: { flex: 1, backgroundColor: '#EEF2F8', borderRadius: 10, padding: 10, alignItems: 'center' },
  financeCellLabel: { fontSize: 10, fontWeight: '600', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, textAlign: 'center' },
  financeCellValue: { fontSize: 14, fontWeight: '800' },
  // Devis card
  devisCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: '#1A3A6B',
  },
  devisHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  devisObjetBadge: { backgroundColor: '#EEF2F8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  devisObjetText: { fontSize: 13, fontWeight: '700', color: '#1A3A6B' },
  devisPrix: { fontSize: 16, fontWeight: '800', color: '#11181C' },
  devisFinanceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  devisFinanceCell: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 8, padding: 8, alignItems: 'center' },
  devisFinanceCellLabel: { fontSize: 10, fontWeight: '600', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2, textAlign: 'center' },
  devisFinanceCellValue: { fontSize: 13, fontWeight: '800' },
  devisDocsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  docBtn: { flex: 1, backgroundColor: '#EEF2F8', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  docBtnUpload: { backgroundColor: '#FFF3CD', borderWidth: 1.5, borderColor: '#FFB74D', borderStyle: 'dashed' },
  docBtnSigne: { backgroundColor: '#D4EDDA' },
  docBtnAttente: { backgroundColor: '#F8F9FA' },
  docBtnText: { fontSize: 12, fontWeight: '600', color: '#1A3A6B' },
  docBtnTextGrey: { fontSize: 12, fontWeight: '500', color: '#B0BEC5' },
  // Acomptes
  acomptesSection: { borderTopWidth: 1, borderTopColor: '#F2F4F7', paddingTop: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  acompteRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  acompteRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  acompteMontant: { fontSize: 15, fontWeight: '800', color: '#27AE60' },
  acompteDate: { fontSize: 12, color: '#687076' },
  acompteComment: { fontSize: 13, color: '#687076', marginBottom: 4 },
  factureLink: { fontSize: 12, fontWeight: '600', color: '#1A3A6B', marginTop: 4 },
  factureUpload: { fontSize: 12, fontWeight: '600', color: '#E67E22', marginTop: 4 },
});

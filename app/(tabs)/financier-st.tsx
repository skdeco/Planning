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

// Documents légaux requis pour les sous-traitants
const DOCUMENTS_LEGAUX_TYPES = [
  { id: 'kbis', label: 'Kbis (< 3 mois)' },
  { id: 'urssaf', label: 'Attestation URSSAF (vigilance)' },
  { id: 'fiscal', label: 'Attestation fiscale' },
  { id: 'decennale', label: 'Assurance décennale' },
  { id: 'rc', label: 'Assurance RC Pro' },
  { id: 'cni', label: "Carte d'identité du dirigeant" },
  { id: 'rib', label: 'RIB' },
];

function normalizeDocLabel(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function findDocForType(documents: any[], typeLabel: string): any | undefined {
  const target = normalizeDocLabel(typeLabel);
  const targetShort = target.split(' ')[0];
  return (documents || []).find(d => {
    const n = normalizeDocLabel(d.libelle || '');
    return n === target || n.includes(targetShort) || target.includes(n);
  });
}

export default function FinancierSTScreen() {
  const { data, currentUser, isHydrated, updateDevis, updateAcompteST, updateSousTraitant } = useApp();
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
    input.click(); setTimeout(() => input.remove(), 60000);
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
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  const openDoc = (uri: string) => {
    if (Platform.OS === 'web') {
      const w = window.open();
      if (w) w.document.write(`<iframe src="${uri}" width="100%" height="100%"></iframe>`);
    }
  };

  // ── Upload d'un document légal par le ST lui-même ──
  const monST = data.sousTraitants.find(s => s.id === stId);
  const handleUploadDocLegal = (typeLabel: string) => {
    if (Platform.OS !== 'web' || !monST) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storageUrl = await uploadFileToStorage(base64, `sous-traitants/${stId}/documents`, docId);
        const newDoc = {
          id: docId,
          libelle: typeLabel,
          fichier: storageUrl || base64,
          uploadedAt: new Date().toISOString(),
        };
        // Remplacer le doc existant du même type OU ajouter
        const existing = findDocForType(monST.documents || [], typeLabel);
        const newDocs = existing
          ? (monST.documents || []).map(d => d.id === existing.id ? newDoc : d)
          : [...(monST.documents || []), newDoc];
        updateSousTraitant({ ...monST, documents: newDocs });
      };
      reader.readAsDataURL(file);
    };
    input.click(); setTimeout(() => input.remove(), 60000);
  };

  const handleDeleteDocLegal = (docId: string) => {
    if (!monST) return;
    const newDocs = (monST.documents || []).filter(d => d.id !== docId);
    updateSousTraitant({ ...monST, documents: newDocs });
  };

  const chantiersIds = Object.keys(devisByChantier);

  return (
    <ScreenContainer containerClassName="bg-[#F5EDE3]">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes finances</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ─── Mes documents légaux ─── */}
        {monST && (() => {
          const nbFournis = DOCUMENTS_LEGAUX_TYPES.filter(t => findDocForType(monST.documents || [], t.label)).length;
          const complete = nbFournis === DOCUMENTS_LEGAUX_TYPES.length;
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 12, marginTop: 12, borderWidth: 1, borderColor: '#E8DDD0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1A1A' }}>📄 Mes documents légaux</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: complete ? '#D4EDDA' : '#FFF3CD' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: complete ? '#155724' : '#856404' }}>{nbFournis}/{DOCUMENTS_LEGAUX_TYPES.length}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: '#8C8077', marginBottom: 10 }}>
                Chargez ici vos documents légaux. L'admin les verra automatiquement.
              </Text>
              {DOCUMENTS_LEGAUX_TYPES.map(t => {
                const doc = findDocForType(monST.documents || [], t.label);
                return (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F0E8DE' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>{t.label}</Text>
                      <Text style={{ fontSize: 10, color: doc ? '#10B981' : '#C9A96E', marginTop: 2 }}>
                        {doc ? `✅ Fourni le ${new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}` : '⚠️ Manquant'}
                      </Text>
                    </View>
                    {doc ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Pressable style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#F5EDE3' }} onPress={() => openDoc(doc.fichier)}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#2C2C2C' }}>Voir</Text>
                        </Pressable>
                        <Pressable style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#FEE2E2' }} onPress={() => handleDeleteDocLegal(doc.id)}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#D94F4F' }}>Suppr.</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#2C2C2C' }} onPress={() => handleUploadDocLegal(t.label)}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>⬆ Charger</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}

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
                  <FinanceCell label="Total convenu" value={fmt(totalPrix)} color="#2C2C2C" />
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
                          <Pressable style={styles.docBtn} onPress={() => openDoc(devis.devisFichier!)}>
                            <Text style={styles.docBtnText}>📄 Mon devis</Text>
                          </Pressable>
                        ) : (
                          <Pressable style={[styles.docBtn, styles.docBtnUpload]} onPress={() => handleUploadDevisFichier(devis.id)}>
                            <Text style={styles.docBtnText}>⬆ Envoyer mon devis</Text>
                          </Pressable>
                        )}
                        {devis.devisSigne ? (
                          <Pressable style={[styles.docBtn, styles.docBtnSigne]} onPress={() => openDoc(devis.devisSigne!)}>
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
                                  <Pressable onPress={() => openDoc(a.facture!)}>
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
    borderLeftWidth: 3, borderLeftColor: '#2C2C2C',
  },
  devisHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  devisObjetBadge: { backgroundColor: '#EEF2F8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  devisObjetText: { fontSize: 13, fontWeight: '700', color: '#2C2C2C' },
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
  docBtnText: { fontSize: 12, fontWeight: '600', color: '#2C2C2C' },
  docBtnTextGrey: { fontSize: 12, fontWeight: '500', color: '#B0BEC5' },
  // Acomptes
  acomptesSection: { borderTopWidth: 1, borderTopColor: '#F5EDE3', paddingTop: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#687076', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  acompteRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5EDE3' },
  acompteRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  acompteMontant: { fontSize: 15, fontWeight: '800', color: '#27AE60' },
  acompteDate: { fontSize: 12, color: '#687076' },
  acompteComment: { fontSize: 13, color: '#687076', marginBottom: 4 },
  factureLink: { fontSize: 12, fontWeight: '600', color: '#2C2C2C', marginTop: 4 },
  factureUpload: { fontSize: 12, fontWeight: '600', color: '#E67E22', marginTop: 4 },
});

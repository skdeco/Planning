import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { useApp } from '@/app/context/AppContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

export function BilanFinancierChantier({ visible, onClose, chantierId }: Props) {
  const { data } = useApp();

  const chantier = data.chantiers.find(c => c.id === chantierId);
  if (!chantier) return null;

  const bilan = useMemo(() => {
    // ── Main d'oeuvre ──
    const affectations = data.affectations.filter(a => a.chantierId === chantierId);
    const employeIds = [...new Set(affectations.map(a => a.employeId))];

    const mainOeuvre: { empNom: string; jours: number; heures: number; cout: number }[] = [];
    let totalMainOeuvre = 0;
    let totalHeures = 0;

    employeIds.forEach(empId => {
      const emp = data.employes.find(e => e.id === empId);
      if (!emp) return;
      // Compter les jours travaillés sur ce chantier
      const joursTravailles = new Set<string>();
      affectations.filter(a => a.employeId === empId).forEach(a => {
        const debut = new Date(a.dateDebut + 'T12:00:00');
        const fin = new Date(a.dateFin + 'T12:00:00');
        const cur = new Date(debut);
        while (cur <= fin) {
          const dow = cur.getDay();
          if (dow !== 0 && dow !== 6) joursTravailles.add(cur.toISOString().slice(0, 10));
          cur.setDate(cur.getDate() + 1);
        }
      });
      // Heures réelles pointées
      let minutesPointees = 0;
      joursTravailles.forEach(dateStr => {
        const pts = data.pointages.filter(p => p.employeId === empId && p.date === dateStr);
        const debut = pts.find(p => p.type === 'debut');
        const fin = pts.find(p => p.type === 'fin');
        if (debut && fin) {
          const [dh, dm] = debut.heure.split(':').map(Number);
          const [fh, fm] = fin.heure.split(':').map(Number);
          minutesPointees += (fh * 60 + fm) - (dh * 60 + dm);
        }
      });
      const heures = Math.round(minutesPointees / 60 * 10) / 10;
      const jours = joursTravailles.size;
      // Coût
      let cout = 0;
      if (emp.modeSalaire === 'journalier' && emp.tarifJournalier) {
        cout = jours * emp.tarifJournalier;
      } else if (emp.salaireNet) {
        cout = Math.round(heures / 8 * (emp.salaireNet / 22)); // estimation
      }
      totalMainOeuvre += cout;
      totalHeures += heures;
      mainOeuvre.push({ empNom: `${emp.prenom} ${emp.nom}`, jours, heures, cout });
    });

    // ── Matériel ──
    const listes = (data.listesMateriaux || []).filter(l => l.chantierId === chantierId);
    const articlesAchetes = listes.flatMap(l => l.items.filter(i => i.achete));
    let totalMateriel = 0;
    const materielDetail: { nom: string; qte: string; prix: number }[] = [];
    articlesAchetes.forEach(item => {
      // Chercher dans le catalogue
      const catalogueMatch = (data.catalogueArticles || []).find(a =>
        item.texte.toLowerCase().includes(a.nom.toLowerCase()) ||
        (a.reference && item.texte.toLowerCase().includes(a.reference.toLowerCase()))
      );
      const prix = catalogueMatch?.prixUnitaire || 0;
      const qteNum = parseFloat(item.quantite || '1') || 1;
      const total = prix * qteNum;
      totalMateriel += total;
      materielDetail.push({ nom: item.texte, qte: item.quantite || '1', prix: total });
    });

    // ── Sous-traitance ──
    const devisChantier = data.devis.filter(d => d.chantierId === chantierId);
    const totalDevis = devisChantier.reduce((s, d) => s + d.prixConvenu, 0);
    const acomptesChantier = data.acomptesst.filter(a => {
      const devis = data.devis.find(d => d.id === a.devisId);
      return devis?.chantierId === chantierId;
    });
    const totalAcomptesST = acomptesChantier.reduce((s, a) => s + a.montant, 0);

    // ── Dépenses directes ──
    const depenses = (data.depenses || []).filter(d => d.chantierId === chantierId);
    const totalDepenses = depenses.reduce((s, d) => s + d.montant, 0);

    // ── Suppléments ──
    const supplements = (data.supplements || []).filter(s => s.chantierId === chantierId);
    const totalSupplements = supplements.reduce((s, sup) => s + (sup.montantTotal || 0), 0);

    const totalGeneral = totalMainOeuvre + totalMateriel + totalAcomptesST + totalDepenses;

    return {
      mainOeuvre, totalMainOeuvre, totalHeures,
      materielDetail, totalMateriel, nbArticles: articlesAchetes.length,
      devisChantier, totalDevis, totalAcomptesST,
      depenses, totalDepenses,
      supplements, totalSupplements,
      totalGeneral,
    };
  }, [data, chantierId]);

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E6EA' }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#11181C' }}>💰 Bilan financier</Text>
              <Text style={{ fontSize: 13, color: '#687076' }}>{chantier.nom}</Text>
            </View>
            <Pressable style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
              <Text style={{ fontSize: 14, color: '#687076', fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            {/* Résumé */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <View style={cardS}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#1A3A6B' }}>{fmt(bilan.totalGeneral)}</Text>
                <Text style={{ fontSize: 10, color: '#687076' }}>Coût total</Text>
              </View>
              <View style={cardS}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#27AE60' }}>{fmt(bilan.totalSupplements)}</Text>
                <Text style={{ fontSize: 10, color: '#687076' }}>Suppléments</Text>
              </View>
            </View>

            {/* Main d'oeuvre */}
            <Text style={sectionS}>👷 Main d'oeuvre — {fmt(bilan.totalMainOeuvre)}</Text>
            <View style={tableS}>
              {bilan.mainOeuvre.map((m, i) => (
                <View key={i} style={rowS}>
                  <Text style={{ flex: 1, fontSize: 12, color: '#11181C' }}>{m.empNom}</Text>
                  <Text style={{ fontSize: 11, color: '#687076', width: 50, textAlign: 'right' }}>{m.jours}j / {m.heures}h</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A3A6B', width: 65, textAlign: 'right' }}>{fmt(m.cout)}</Text>
                </View>
              ))}
              {bilan.mainOeuvre.length === 0 && <Text style={{ fontSize: 12, color: '#B0BEC5', padding: 8 }}>Aucune donnée</Text>}
            </View>

            {/* Matériel */}
            <Text style={sectionS}>🛒 Matériel — {fmt(bilan.totalMateriel)} ({bilan.nbArticles} articles)</Text>
            <View style={tableS}>
              {bilan.materielDetail.filter(m => m.prix > 0).map((m, i) => (
                <View key={i} style={rowS}>
                  <Text style={{ flex: 1, fontSize: 12, color: '#11181C' }} numberOfLines={1}>{m.nom}</Text>
                  <Text style={{ fontSize: 11, color: '#687076', width: 30, textAlign: 'right' }}>×{m.qte}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A3A6B', width: 65, textAlign: 'right' }}>{fmt(m.prix)}</Text>
                </View>
              ))}
              {bilan.materielDetail.filter(m => m.prix > 0).length === 0 && (
                <Text style={{ fontSize: 12, color: '#B0BEC5', padding: 8 }}>
                  {bilan.nbArticles > 0 ? `${bilan.nbArticles} articles achetés (prix non renseigné dans le catalogue)` : 'Aucun achat'}
                </Text>
              )}
            </View>

            {/* Sous-traitance */}
            <Text style={sectionS}>🔧 Sous-traitance — {fmt(bilan.totalAcomptesST)} versés / {fmt(bilan.totalDevis)} engagés</Text>
            <View style={tableS}>
              {bilan.devisChantier.map((d, i) => {
                const st = data.sousTraitants.find(s => s.id === d.soustraitantId);
                const acomptes = data.acomptesst.filter(a => a.devisId === d.id).reduce((s, a) => s + a.montant, 0);
                return (
                  <View key={i} style={rowS}>
                    <Text style={{ flex: 1, fontSize: 12, color: '#11181C' }} numberOfLines={1}>{st?.nom || '?'} — {d.objet}</Text>
                    <Text style={{ fontSize: 11, color: '#687076', width: 55, textAlign: 'right' }}>{fmt(acomptes)}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A3A6B', width: 65, textAlign: 'right' }}>{fmt(d.prixConvenu)}</Text>
                  </View>
                );
              })}
              {bilan.devisChantier.length === 0 && <Text style={{ fontSize: 12, color: '#B0BEC5', padding: 8 }}>Aucun devis</Text>}
            </View>

            {/* Dépenses directes */}
            {bilan.depenses.length > 0 && (
              <>
                <Text style={sectionS}>💳 Dépenses directes — {fmt(bilan.totalDepenses)}</Text>
                <View style={tableS}>
                  {bilan.depenses.map((d, i) => (
                    <View key={i} style={rowS}>
                      <Text style={{ flex: 1, fontSize: 12, color: '#11181C' }} numberOfLines={1}>{d.libelle}</Text>
                      <Text style={{ fontSize: 11, color: '#687076', width: 60, textAlign: 'right' }}>{d.date.split('-').reverse().join('/')}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A3A6B', width: 65, textAlign: 'right' }}>{fmt(d.montant)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const cardS = { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' as const, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1, borderWidth: 1, borderColor: '#E2E6EA' };
const sectionS = { fontSize: 14, fontWeight: '700' as const, color: '#11181C', marginTop: 16, marginBottom: 6 };
const tableS = { backgroundColor: '#FAFBFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E6EA', overflow: 'hidden' as const };
const rowS = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#E2E6EA', gap: 6 };

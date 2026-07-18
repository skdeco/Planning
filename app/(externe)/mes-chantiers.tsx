import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { PortailClient } from '@/components/PortailClient';
import { STATUT_LABELS, STATUT_COLORS } from '@/app/types';
import { getChantierLots } from '@/lib/chantier/getChantierLots';
import { FadeInView } from '@/components/ui/animated';
import { hapticSelection } from '@/lib/haptics';

export default function MesChantiersExterne() {
  const { data, currentUser } = useApp();
  const apporteurId = currentUser?.apporteurId;
  const apporteur = (data.apporteurs || []).find(a => a.id === apporteurId);
  const [showClos, setShowClos] = useState(false);
  const [openChantier, setOpenChantier] = useState<string | null>(null);

  const mesChantiers = useMemo(() => {
    if (!apporteurId) return [];
    // Liste des chantiers où cet apporteur est lié (client, architecte, apporteur, contractant)
    return data.chantiers.filter(c =>
      c.clientApporteurId === apporteurId ||
      c.architecteId === apporteurId ||
      c.apporteurId === apporteurId ||
      c.contractantId === apporteurId
    );
  }, [data.chantiers, apporteurId]);

  // Actifs = pas clôturé. Clôturés = limite 3 ans.
  const { actifs, clos } = useMemo(() => {
    const actifs: typeof mesChantiers = [];
    const clos: typeof mesChantiers = [];
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 3);
    for (const c of mesChantiers) {
      const isClos = c.statutChantier === 'cloture' || (c as any).statut === 'termine' || (c as any).statut === 'archive';
      if (isClos) {
        const dateRef = (c as any).updatedAt || (c as any).dateFin || null;
        const d = dateRef ? new Date(dateRef) : null;
        if (!d || d >= cutoff) clos.push(c);
      } else {
        actifs.push(c);
      }
    }
    return { actifs, clos };
  }, [mesChantiers]);

  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

  // Récap portefeuille apporteur/architecte : commission à percevoir sur ses chantiers.
  const recapApporteur = useMemo(() => {
    if (!apporteur || apporteur.type === 'client') return null;
    let totalCom = 0, dueCom = 0;
    (data.marchesChantier || []).forEach(m => {
      const c = m.commission;
      if (!c || c.apporteurId !== apporteurId) return;
      const montant = c.modeCommission === 'montant' ? c.valeur : (c.baseCalcul === 'TTC' ? m.montantTTC : m.montantHT) * (c.valeur / 100);
      totalCom += montant;
      if (c.statut !== 'paye') dueCom += montant;
    });
    return { totalCom, dueCom };
  }, [data.marchesChantier, apporteurId, apporteur]);

  const renderCard = (c: typeof mesChantiers[number], index: number) => {
    const derniereVue = apporteurId ? c.dernieresVuesParApporteur?.[apporteurId] : undefined;
    const derniereMaj = c.derniereMajContenu;
    const isNew = derniereMaj && (!derniereVue || derniereMaj > derniereVue);
    return (
      <FadeInView key={c.id} delay={Math.min(index * 45, 360)}>
      <Pressable style={styles.card} onPress={() => { hapticSelection(); setOpenChantier(c.id); }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.cardTitle}>{c.nom}</Text>
            {isNew && (
              <View style={{ backgroundColor: '#E74C3C', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>NOUVEAU</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardAddress}>
            {[c.rue, c.codePostal, c.ville].filter(Boolean).join(', ') || c.adresse || '—'}
          </Text>
          {(() => {
            const lots = getChantierLots(c, data.marchesChantier, data.supplementsMarche);
            const pct = lots.length ? Math.round(lots.reduce((s, l) => s + (l.pourcentage || 0), 0) / lots.length) : null;
            const st = STATUT_COLORS[c.statut];
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {st && (
                  <View style={{ backgroundColor: st.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: st.text }}>{STATUT_LABELS[c.statut]}</Text>
                  </View>
                )}
                {pct !== null && <Text style={styles.cardMeta}>Avancement {pct}%</Text>}
              </View>
            );
          })()}
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </Pressable>
      </FadeInView>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F5EDE3' }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      {recapApporteur && recapApporteur.totalCom > 0 && (
        <View style={styles.recapBox}>
          <View style={styles.recapItem}>
            <Text style={styles.recapVal}>{actifs.length}</Text>
            <Text style={styles.recapLbl}>Chantiers actifs</Text>
          </View>
          <View style={styles.recapSep} />
          <View style={styles.recapItem}>
            <Text style={[styles.recapVal, { color: '#8C6D2F' }]}>{fmt(recapApporteur.dueCom)} €</Text>
            <Text style={styles.recapLbl}>Commission à percevoir</Text>
          </View>
        </View>
      )}
      <Text style={styles.sectionTitle}>🏗️ Chantiers en cours ({actifs.length})</Text>
      {actifs.length === 0 ? (
        <Text style={styles.empty}>Aucun chantier actif.</Text>
      ) : (
        actifs.map(renderCard)
      )}

      {clos.length > 0 && (
        <>
          <Pressable onPress={() => setShowClos(s => !s)} style={styles.toggleClos}>
            <Text style={styles.toggleClosText}>
              {showClos ? '▾' : '▸'} Chantiers clôturés ({clos.length}) — 3 ans max
            </Text>
          </Pressable>
          {showClos && clos.map(renderCard)}
        </>
      )}

      {apporteur && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Connecté en tant que</Text>
          <Text style={styles.infoValue}>
            {apporteur.prenom} {apporteur.nom} · {apporteur.type === 'client' ? 'Client' : apporteur.type === 'architecte' ? 'Architecte' : apporteur.type === 'contractant' ? 'Contractant' : 'Apporteur d\'affaires'}
          </Text>
        </View>
      )}

      {openChantier && (
        <PortailClient
          visible={!!openChantier}
          onClose={() => setOpenChantier(null)}
          chantierId={openChantier}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C2C2C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#2C2C2C' },
  cardAddress: { fontSize: 12, color: '#8C8077', marginTop: 2 },
  cardMeta: { fontSize: 11, color: '#8C6D2F', fontWeight: '700', marginTop: 4 },
  cardArrow: { fontSize: 24, color: '#C9A96E', fontWeight: '300' },
  recapBox: { flexDirection: 'row', backgroundColor: '#2C2C2C', borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  recapItem: { flex: 1, alignItems: 'center' },
  recapSep: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.15)' },
  recapVal: { fontSize: 20, fontWeight: '800', color: '#fff' },
  recapLbl: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, textAlign: 'center' },
  empty: { fontSize: 13, color: '#8C8077', fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  toggleClos: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8DDD0',
  },
  toggleClosText: { fontSize: 13, fontWeight: '700', color: '#2C2C2C' },
  infoBox: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#FAF7F3',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#C9A96E',
  },
  infoLabel: { fontSize: 10, color: '#8C8077', fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, color: '#2C2C2C', fontWeight: '700', marginTop: 2 },
});

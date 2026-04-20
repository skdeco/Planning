import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useApp } from '@/app/context/AppContext';
import { PortailClient } from '@/components/PortailClient';

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
      const isClos = c.statutChantier === 'cloture' || (c as any).statut === 'termine';
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

  const renderCard = (c: typeof mesChantiers[number]) => (
    <Pressable key={c.id} style={styles.card} onPress={() => setOpenChantier(c.id)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{c.nom}</Text>
        <Text style={styles.cardAddress}>
          {[c.rue, c.codePostal, c.ville].filter(Boolean).join(', ') || c.adresse || '—'}
        </Text>
        {c.avancementCorps && c.avancementCorps.length > 0 && (
          <Text style={styles.cardMeta}>
            {c.avancementCorps.length} lot(s) · {c.avancementCorps.filter(l => l.enCours).length} en cours
          </Text>
        )}
      </View>
      <Text style={styles.cardArrow}>›</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F5EDE3' }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
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

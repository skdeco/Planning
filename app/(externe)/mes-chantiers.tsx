import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from 'react-native';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/app/context/AppContext';
import { chantiersDuContact } from '@/lib/portail/chantiersDuContact';
import { PortailClient } from '@/components/PortailClient';
import { CreerChantierArchi } from '@/components/externe/CreerChantierArchi';
import { STATUT_LABELS, STATUT_COLORS } from '@/app/types';
import { getChantierLots } from '@/lib/chantier/getChantierLots';
import { FadeInView } from '@/components/ui/animated';
import { hapticSelection } from '@/lib/haptics';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2 } from 'lucide-react-native';
import { RdvDuJour } from '@/components/espaces/RdvDuJour';

export default function MesChantiersExterne() {
  const { data, currentUser } = useApp();
  const apporteurId = currentUser?.apporteurId;
  const apporteur = (data.apporteurs || []).find(a => a.id === apporteurId);
  const [showClos, setShowClos] = useState(false);
  const [openChantier, setOpenChantier] = useState<string | null>(null);
  const [showCreer, setShowCreer] = useState(false);
  const isArchitecte = apporteur?.type === 'architecte';
  const isCommercial = apporteur?.type === 'commercial';
  // Espace commercial : deux sections (Menuiserie / Travaux) + filtres comme l'admin.
  const [filtreStatutCom, setFiltreStatutCom] = useState<'en_cours' | 'termine' | 'tous'>('en_cours');
  const [rechercheCom, setRechercheCom] = useState('');

  const mesChantiers = useMemo(() => {
    if (!apporteurId) return [];
    // Liste des chantiers où ce contact est rattaché (client, architecte,
    // apporteur, contractant ou commercial).
    return chantiersDuContact(data.chantiers, apporteurId);
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
            const st = STATUT_COLORS[c.statut] ?? STATUT_COLORS.actif;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {st && (
                  <View style={{ backgroundColor: st.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: st.text }}>{STATUT_LABELS[c.statut]}</Text>
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
    <ScrollView style={{ flex: 1, backgroundColor: '#F4F4F2' }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <RdvDuJour marge={0} />
      {recapApporteur && recapApporteur.totalCom > 0 && (
        <View style={styles.recapBox}>
          <View style={styles.recapItem}>
            <Text style={styles.recapVal}>{actifs.length}</Text>
            <Text style={styles.recapLbl}>Chantiers actifs</Text>
          </View>
          <View style={styles.recapSep} />
          <View style={styles.recapItem}>
            <Text style={[styles.recapVal, { color: '#141414' }]}>{fmt(recapApporteur.dueCom)} €</Text>
            <Text style={styles.recapLbl}>Commission à percevoir</Text>
          </View>
        </View>
      )}
      {(isArchitecte || isCommercial) && (
        <Pressable style={styles.creerBtn} onPress={() => setShowCreer(true)}>
          <Text style={styles.creerBtnText}>＋ Créer un chantier</Text>
        </Pressable>
      )}
      {isCommercial ? (
        (() => {
          // La Menuiserie a son propre espace (onglet du haut) : ici, tous les chantiers Travaux
          const dansSection = (c: any) => (c.categorie || 'chantier') !== 'lieuFixe';
          const q = rechercheCom.trim().toLowerCase();
          const liste = mesChantiers
            .filter(dansSection)
            .filter(c => {
              const clos = (c as any).statutChantier === 'cloture' || (c as any).statut === 'termine' || (c as any).statut === 'archive';
              if (filtreStatutCom === 'en_cours') return !clos;
              if (filtreStatutCom === 'termine') return clos;
              return true;
            })
            .filter(c => !q || c.nom.toLowerCase().includes(q) || (c.adresse || '').toLowerCase().includes(q) || ((c as any).ville || '').toLowerCase().includes(q));
          return (
            <>
              {/* Filtres : recherche + statut */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <View style={{ flex: 1.3, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 999, borderWidth: 1, borderColor: '#E2E2DF', paddingHorizontal: 14 }}>
                  <TextInput
                    style={{ flex: 1, paddingVertical: 9, fontSize: 14, color: '#141414' }}
                    placeholder="Rechercher…"
                    placeholderTextColor="#B0A99F"
                    value={rechercheCom}
                    onChangeText={setRechercheCom}
                  />
                  {rechercheCom.length > 0 && (
                    <Pressable onPress={() => setRechercheCom('')} hitSlop={8}><Text style={{ color: '#959593', fontSize: 15 }}>✕</Text></Pressable>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <SelectField
                    compact
                    value={filtreStatutCom}
                    title="Statut"
                    options={[
                      { value: 'en_cours', label: 'En cours' },
                      { value: 'termine', label: 'Terminés' },
                      { value: 'tous', label: 'Tous' },
                    ]}
                    onSelect={v => setFiltreStatutCom(v as typeof filtreStatutCom)}
                  />
                </View>
              </View>
              {liste.length === 0 ? (
                <EmptyState icon={<View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: '#EBEBE8', alignItems: 'center', justifyContent: 'center' }}><Building2 size={34} color="#959593" strokeWidth={1.6} /></View>} title="Aucun chantier." />
              ) : (
                liste.map(renderCard)
              )}
            </>
          );
        })()
      ) : (
        <>
          <Text style={styles.sectionTitle}>Chantiers en cours ({actifs.length})</Text>
          {actifs.length === 0 ? (
            <EmptyState icon={<View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: '#EBEBE8', alignItems: 'center', justifyContent: 'center' }}><Building2 size={34} color="#959593" strokeWidth={1.6} /></View>} title="Aucun chantier actif." />
          ) : (
            actifs.map(renderCard)
          )}
        </>
      )}

      {!isCommercial && clos.length > 0 && (
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
            {apporteur.prenom} {apporteur.nom} · {apporteur.type === 'client' ? 'Client' : apporteur.type === 'architecte' ? 'Architecte' : apporteur.type === 'commercial' ? 'Commercial' : 'Apporteur d\'affaires'}
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

      {(isArchitecte || isCommercial) && apporteurId && (
        <CreerChantierArchi
          role={isCommercial ? 'commercial' : 'architecte'}
          visible={showCreer}
          onClose={() => setShowCreer(false)}
          architecteId={apporteurId}
          onCreated={(id) => { setShowCreer(false); setOpenChantier(id); }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6A6A68',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  creerBtn: { backgroundColor: '#141414', borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginBottom: 16 },
  creerBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#141414', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  cardTitle: { fontSize: 16.5, fontWeight: '600', color: '#141414' },
  cardAddress: { fontSize: 13.5, color: '#6A6A68', marginTop: 2 },
  cardMeta: { fontSize: 13, color: '#141414', fontWeight: '600', marginTop: 4 },
  cardArrow: { fontSize: 24, color: '#141414', fontWeight: '300' },
  recapBox: { flexDirection: 'row', backgroundColor: '#141414', borderRadius: 24, padding: 18, marginBottom: 16, alignItems: 'center' },
  recapItem: { flex: 1, alignItems: 'center' },
  recapSep: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.15)' },
  recapVal: { fontFamily: 'Manrope_500Medium', fontSize: 24, color: '#fff' },
  recapLbl: { fontSize: 12.5, color: 'rgba(255,255,255,0.75)', marginTop: 4, textAlign: 'center' },
  empty: { fontSize: 14, color: '#6A6A68', textAlign: 'center', paddingVertical: 24 },
  toggleClos: {
    backgroundColor: '#fff',
    borderRadius: 999,
    padding: 14,
    marginTop: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E2DF',
  },
  toggleClosText: { fontSize: 14, fontWeight: '600', color: '#141414', textAlign: 'center' },
  infoBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#EBEBE8',
    borderRadius: 18,
  },
  infoLabel: { fontSize: 12, color: '#6A6A68', fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  infoValue: { fontSize: 14.5, color: '#141414', fontWeight: '500', marginTop: 3 },
});

import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Linking, StyleSheet } from 'react-native';
import { X, Phone, Mail, Users } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { DS, radius, space, font } from '@/constants/design';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * AnnuairePanel — annuaire des intervenants du chantier (lecture seule).
 * Agrège les contacts existants (MOA, MOE, partenaires, entreprises/ST, équipe)
 * avec appel / mail en 1 tap. Module commun (aussi côté entreprise). Palette V10.
 */
export interface AnnuairePanelProps {
  visible: boolean;
  onClose: () => void;
  chantierId: string;
}

type Contact = { id: string; nom: string; role: string; tel?: string; email?: string; av: 'moa' | 'moe' | 'ent' | 'def' };

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export function AnnuairePanel({ visible, onClose, chantierId }: AnnuairePanelProps) {
  const { data } = useApp();
  const chantier = useMemo(() => data.chantiers.find(c => c.id === chantierId), [data.chantiers, chantierId]);

  const groupes = useMemo(() => {
    if (!chantier) return [] as { titre: string; contacts: Contact[] }[];
    const findApp = (id?: string) => (id ? (data.apporteurs || []).find(a => a.id === id) : undefined);
    const nomApp = (a: { prenom: string; nom: string; societe?: string }) => a.societe || `${a.prenom} ${a.nom}`.trim();

    const moa: Contact[] = [];
    const cl = findApp(chantier.clientApporteurId);
    if (cl) moa.push({ id: cl.id, nom: nomApp(cl), role: 'Client · maître d\'ouvrage', tel: cl.telephone, email: cl.email, av: 'moa' });

    const moe: Contact[] = [];
    const ar = findApp(chantier.architecteId);
    if (ar) moe.push({ id: ar.id, nom: nomApp(ar), role: 'Architecte', tel: ar.telephone, email: ar.email, av: 'moe' });

    const partenaires: Contact[] = [];
    const ap = findApp(chantier.apporteurId);
    if (ap) partenaires.push({ id: ap.id, nom: nomApp(ap), role: 'Apporteur d\'affaires', tel: ap.telephone, email: ap.email, av: 'def' });
    const co = findApp(chantier.contractantId);
    if (co) partenaires.push({ id: co.id, nom: nomApp(co), role: 'Contractant', tel: co.telephone, email: co.email, av: 'def' });

    // Entreprises / sous-traitants affectés
    const stIds = new Set(
      (data.affectations || []).filter(a => a.chantierId === chantierId && a.soustraitantId).map(a => a.soustraitantId as string),
    );
    const entreprises: Contact[] = (data.sousTraitants || [])
      .filter(s => stIds.has(s.id))
      .map(s => ({ id: s.id, nom: s.societe || `${s.prenom} ${s.nom}`.trim(), role: 'Entreprise / sous-traitant', tel: s.telephone, email: s.email, av: 'ent' }));

    // Équipe affectée
    const equipe: Contact[] = (chantier.employeIds || [])
      .map(eid => (data.employes || []).find(e => e.id === eid))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map(e => ({ id: e.id, nom: `${e.prenom} ${e.nom}`.trim(), role: e.metier || 'Équipe', tel: e.telephone, email: e.email, av: 'def' }));

    return [
      { titre: 'Maîtrise d\'ouvrage', contacts: moa },
      { titre: 'Maîtrise d\'œuvre', contacts: moe },
      { titre: 'Partenaires', contacts: partenaires },
      { titre: 'Entreprises', contacts: entreprises },
      { titre: 'Équipe', contacts: equipe },
    ].filter(g => g.contacts.length > 0);
  }, [chantier, chantierId, data.apporteurs, data.affectations, data.sousTraitants, data.employes]);

  const call = (tel?: string) => { if (tel) Linking.openURL(`tel:${tel.replace(/\s/g, '')}`).catch(() => {}); };
  const mail = (email?: string) => { if (email) Linking.openURL(`mailto:${email}`).catch(() => {}); };

  const avStyle = (t: Contact['av']) => (t === 'moa' ? styles.avMoa : t === 'ent' ? styles.avEnt : styles.avDef);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Annuaire</Text>
            {chantier?.nom ? <Text style={styles.hSub}>{chantier.nom}</Text> : null}
          </View>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}><X size={20} color={DS.sombre} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {groupes.length === 0 ? (
            <EmptyState iconComponent={Users} title="Aucun intervenant" description="Liez un client, un architecte, des entreprises ou une équipe au chantier." />
          ) : (
            groupes.map(g => (
              <View key={g.titre} style={styles.group}>
                <Text style={styles.groupTitle}>{g.titre}</Text>
                {g.contacts.map(c => (
                  <View key={`${g.titre}-${c.id}`} style={styles.contact}>
                    <View style={[styles.av, avStyle(c.av)]}><Text style={[styles.avText, c.av === 'moa' && styles.avTextInv]}>{initiales(c.nom)}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cNom} numberOfLines={1}>{c.nom}</Text>
                      <Text style={styles.cRole} numberOfLines={1}>{c.role}</Text>
                    </View>
                    {c.tel ? <Pressable hitSlop={6} onPress={() => call(c.tel)} style={styles.act}><Phone size={15} color={DS.bordeaux} /></Pressable> : null}
                    {c.email ? <Pressable hitSlop={6} onPress={() => mail(c.email)} style={styles.act}><Mail size={15} color={DS.bordeaux} /></Pressable> : null}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.cremeFond },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingTop: space.xxxl, paddingBottom: space.md },
  hTitle: { fontSize: font.xl, fontWeight: font.heavy, color: DS.sombre, textTransform: 'uppercase' },
  hSub: { fontSize: font.compact, fontWeight: font.semibold, color: DS.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  group: { marginBottom: space.lg },
  groupTitle: { fontSize: font.tiny, fontWeight: font.bold, color: DS.bordeaux, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: space.sm },
  contact: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: DS.surface, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border, padding: space.md, marginBottom: space.xs },
  av: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  avMoa: { backgroundColor: DS.bordeaux },
  avEnt: { backgroundColor: DS.nudeMoyen },
  avDef: { backgroundColor: DS.cremeNude },
  avText: { fontSize: font.compact, fontWeight: font.heavy, color: DS.bordeaux },
  avTextInv: { color: DS.cremeFond },
  cNom: { fontSize: font.body, fontWeight: font.bold, color: DS.sombre },
  cRole: { fontSize: font.compact, color: DS.textSecondary, marginTop: 1 },
  act: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.cremeNude },
});

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { DS, font, space, radius } from '../constants/design';
import { StatusBadge, statutBadgeProps } from '../components/ui/StatusBadge';
import { SectionHeader } from '../components/ui/SectionHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterChip } from '../components/ui/FilterChip';
import { ChantierListCard } from '../components/ui/ChantierListCard';
import { ChantierDashboardCard } from '../components/ui/ChantierDashboardCard';

export default function Playground() {
  const [statut, setStatut]       = useState<'all' | 'actif' | 'pause' | 'termine'>('all');
  const [metiers, setMetiers]     = useState<Set<string>>(new Set());
  const [metierActif, setMetierActif] = useState<string | null>('maconnerie');

  function toggleMetier(m: string) {
    setMetiers(prev => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>

      <Text style={styles.pageTitle}>Playground — UI Components</Text>
      <Text style={styles.pageSub}>Fichier temporaire · Phase 1</Text>

      {/* ════════════════════════════════════════════════════════
          SECTION 1 — StatusBadge : variants sémantiques
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 1 — StatusBadge : variants sémantiques" size="lg" separator />

        <SectionHeader title="1.1  md (défaut)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge variant="success" label="success" />
          <StatusBadge variant="warning" label="warning" />
          <StatusBadge variant="error"   label="error" />
          <StatusBadge variant="info"    label="info" />
          <StatusBadge variant="neutral" label="neutral" />
        </View>

        <SectionHeader title="1.2  size sm" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge variant="success" label="sm" size="sm" />
          <StatusBadge variant="warning" label="sm" size="sm" />
          <StatusBadge variant="error"   label="sm" size="sm" />
          <StatusBadge variant="info"    label="sm" size="sm" />
          <StatusBadge variant="neutral" label="sm" size="sm" />
        </View>

        <SectionHeader title="1.3  dot + uppercase" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge variant="success" label="dot"   dot />
          <StatusBadge variant="warning" label="dot"   dot />
          <StatusBadge variant="error"   label="upper" uppercase />
          <StatusBadge variant="info"    label="upper" uppercase />
          <StatusBadge variant="neutral" label="upper" uppercase />
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — StatusBadge : palettes métier
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 2 — StatusBadge : palettes métier" size="lg" separator />

        <SectionHeader title="2.1  statutBadgeProps (Mode 2)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge {...statutBadgeProps('actif')} />
          <StatusBadge {...statutBadgeProps('en_attente')} />
          <StatusBadge {...statutBadgeProps('en_pause')} />
          <StatusBadge {...statutBadgeProps('sav')} />
          <StatusBadge {...statutBadgeProps('termine')} />
        </View>

        <SectionHeader title="2.2  métier dot + apporteur uppercase" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge label="Maçonnerie" bg={DS.accent + '18'} color={DS.accent} dot size="sm" />
          <StatusBadge label="Peinture"   bg={DS.info   + '18'} color={DS.info}   dot size="sm" />
          <StatusBadge label="SK-2024" bg={DS.primary} color={DS.textInverse} uppercase size="sm" />
          <StatusBadge label="AP-007"  bg={DS.accent}  color={DS.textInverse} uppercase size="sm" />
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — StatusBadge : cas limites
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 3 — StatusBadge : cas limites" size="lg" separator />

        <SectionHeader title="3.1  fallback neutral (ni variant ni bg/color)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge label="Fallback neutral" />
        </View>

        <SectionHeader title="3.2  label long (numberOfLines=1)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge variant="warning" label="En attente de signature client" />
        </View>

        <SectionHeader title="3.3  dot + icon → icon prime" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <StatusBadge variant="info" label="icon prime" dot icon={<View style={styles.iconBox} />} />
          <StatusBadge variant="info" label="dot seul"   dot />
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════
          SECTION 4 — SectionHeader
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 4 — SectionHeader" size="lg" separator />

        <SectionHeader title="H1 — basic (titre seul)" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader title="Prochains rendez-vous" />
        </View>

        <SectionHeader title="H2 — uppercase + sm" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader title="Archivées" uppercase size="sm" />
        </View>

        <SectionHeader title="H3 — uppercase + sm + separator + action" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader
            title="Acomptes"
            uppercase
            size="sm"
            separator
            action={
              <Pressable onPress={() => {}}>
                <Text style={styles.actionAccent}>+</Text>
              </Pressable>
            }
          />
        </View>

        <SectionHeader title="H4 — md + action texte" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader
            title="Carte d'identité"
            size="md"
            action={
              <Pressable onPress={() => {}}>
                <Text style={styles.actionInfo}>Upload</Text>
              </Pressable>
            }
          />
        </View>

        <SectionHeader title="H5 — subtitle + StatusBadge en action (intégration)" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader
            title="Chantier Martin"
            subtitle="12 rue de la Paix"
            action={
              <View style={styles.badgeGroup}>
                <StatusBadge variant="success" label="3" size="sm" />
                <StatusBadge variant="error"   label="1" size="sm" />
              </View>
            }
          />
        </View>

        <SectionHeader title="H6 — count inline" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader title="Ikea" count={3} size="sm" />
        </View>

        <SectionHeader title="H7 — lg" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader title="Statistiques" size="lg" />
        </View>

        <SectionHeader title="Cas limites" uppercase size="sm" style={styles.sub} />
        <View style={styles.demoBox}>
          <SectionHeader
            title="Titre principal"
            subtitle="Sous-titre très long destiné à tester le comportement du composant en conditions réelles — il devrait wrapper naturellement sur deux lignes ou plus."
          />
        </View>
        <View style={[styles.demoBox, styles.demoBoxTop]}>
          <SectionHeader title="Un titre très long pour tester le wrapping ou la troncature lorsque l'espace horizontal est contraint par un contexte de liste ou de modal" />
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════
          SECTION 5 — EmptyState
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 5 — EmptyState" size="lg" separator />

        <SectionHeader
          title="Type 1 — md + emoji  (parent 200px → centrage vertical actif)"
          uppercase size="sm" style={styles.sub}
        />
        <View style={styles.emptyContainer}>
          <EmptyState
            size="md"
            style={styles.emptyFill}
            icon={<Text style={styles.emoji}>📭</Text>}
            title="Aucun rendez-vous ce jour"
          />
        </View>

        <SectionHeader
          title="Type 2 — md + description, sans icon"
          uppercase size="sm" style={styles.sub}
        />
        <View style={styles.emptyContainer}>
          <EmptyState
            size="md"
            style={styles.emptyFill}
            title="Aucun architecte ni apporteur"
            description="Ajoutez-en un pour gérer vos prestataires externes."
          />
        </View>

        <SectionHeader
          title="Type 3 — sm, texte seul compact (inline liste)"
          uppercase size="sm" style={styles.sub}
        />
        <View style={styles.inlineBox}>
          <EmptyState size="sm" title="Aucun acompte" />
        </View>

        <SectionHeader
          title="Bonus — forward-compat : action CTA"
          uppercase size="sm" style={styles.sub}
        />
        <View style={styles.emptyContainer}>
          <EmptyState
            size="md"
            style={styles.emptyFill}
            icon={<Text style={styles.emoji}>🏗️</Text>}
            title="Pas encore de chantier"
            description="Créez votre premier chantier pour commencer le suivi."
            action={
              <Pressable style={styles.demoBtn}>
                <Text style={styles.demoBtnText}>Créer un chantier</Text>
              </Pressable>
            }
          />
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════
          SECTION 6 — FilterChip
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 6 — FilterChip" size="lg" separator />

        <SectionHeader title="6.1  États de base (inactive / active / disabled)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <FilterChip label="Inactif" />
          <FilterChip label="Actif" active />
          <FilterChip label="Désactivé" disabled />
        </View>

        <SectionHeader title="6.2  size sm" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <FilterChip label="Inactif" size="sm" />
          <FilterChip label="Actif" size="sm" active />
          <FilterChip label="Désactivé" size="sm" disabled />
        </View>

        <SectionHeader title="6.3  Single-select — statut chantier (interactif)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          {(['all', 'actif', 'pause', 'termine'] as const).map(s => (
            <FilterChip
              key={s}
              label={s === 'all' ? 'Tous' : s === 'actif' ? 'En cours' : s === 'pause' ? 'En pause' : 'Terminé'}
              active={statut === s}
              onPress={() => setStatut(s)}
            />
          ))}
        </View>

        <SectionHeader title="6.4  Multi-select avec count (interactif)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          {[
            { id: 'maconnerie', label: 'Maçonnerie', count: 5, color: DS.accent },
            { id: 'peinture',   label: 'Peinture',   count: 3, color: DS.info },
            { id: 'electricite',label: 'Électricité', count: 8, color: DS.warning },
          ].map(m => (
            <FilterChip
              key={m.id}
              label={m.label}
              count={m.count}
              active={metiers.has(m.id)}
              activeColor={m.color}
              activeTextColor={DS.textInverse}
              onPress={() => toggleMetier(m.id)}
            />
          ))}
        </View>

        <SectionHeader title="6.5  Avec icône (dot coloré)" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <FilterChip
            label="Maçonnerie"
            icon={<View style={[styles.chipDot, { backgroundColor: DS.accent }]} />}
            active={metierActif === 'maconnerie'}
            activeColor={DS.accent}
            activeTextColor={DS.textInverse}
            onPress={() => setMetierActif(metierActif === 'maconnerie' ? null : 'maconnerie')}
          />
          <FilterChip
            label="Peinture"
            icon={<View style={[styles.chipDot, { backgroundColor: DS.info }]} />}
            active={metierActif === 'peinture'}
            activeColor={DS.info}
            activeTextColor={DS.textInverse}
            onPress={() => setMetierActif(metierActif === 'peinture' ? null : 'peinture')}
          />
          <FilterChip
            label="Désactivé"
            icon={<View style={[styles.chipDot, { backgroundColor: DS.textDisabled }]} />}
            disabled
          />
        </View>

        <SectionHeader title="6.6  Cas limites — count disabled, label long" uppercase size="sm" style={styles.sub} />
        <View style={styles.row}>
          <FilterChip label="Avec count" count={42} active />
          <FilterChip label="Count disabled" count={7} disabled />
          <FilterChip label="Label un peu plus long que d'habitude" size="sm" />
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════
          SECTION 7 — ChantierListCard
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 7 — ChantierListCard" size="lg" separator />

        <SectionHeader title="7.1  Cas complet (tous les champs)" uppercase size="sm" style={styles.sub} />
        <ChantierListCard
          nom="Rénovation Villa Martin"
          couleur={DS.accent}
          adresse="12 rue de la Paix, 75001 Paris"
          statut="actif"
          dateDebut="01/03/2026"
          dateFin="30/06/2026"
          contacts={[
            { role: 'architecte',    nom: 'Marie Dubois' },
            { role: 'apporteur',     nom: 'Jean Petit' },
            { role: 'sous_traitant', nom: 'SARL Toiture' },
            { role: 'client',        nom: 'Famille Martin' },
          ]}
          employes={[
            { nom: 'Thomas', metierColor: DS.info },
            { nom: 'Sofia',  metierColor: DS.warning },
            { nom: 'Karim',  metierColor: DS.accent },
          ]}
          counts={{ notes: 4, plans: 2, photos: 18, achats: 7 }}
          onPress={() => {}}
        />

        <SectionHeader title="7.2  Cas minimal (noyau dur uniquement)" uppercase size="sm" style={styles.sub} />
        <ChantierListCard
          nom="Extension Maison Durand"
          couleur={DS.info}
          adresse="3 avenue des Lilas"
          statut="en_attente"
          onPress={() => {}}
        />

        <SectionHeader title="7.3  Sans statut (contexte archives)" uppercase size="sm" style={styles.sub} />
        <ChantierListCard
          nom="Chantier archivé 2024-07"
          couleur={DS.textAlt}
          adresse="Ancien site"
          dateDebut="05/01/2024"
          dateFin="20/07/2024"
          counts={{ photos: 42 }}
        />

        <SectionHeader title="7.4  Compteurs partiels (0 affiché, undefined masqué)" uppercase size="sm" style={styles.sub} />
        <ChantierListCard
          nom="Nouveau chantier"
          couleur={DS.success}
          adresse="Sans intervention"
          statut="actif"
          counts={{ notes: 0, photos: 0 }}
          onPress={() => {}}
        />

        <SectionHeader title="7.5  Lecture seule (pas d'onPress)" uppercase size="sm" style={styles.sub} />
        <ChantierListCard
          nom="Chantier lecture seule"
          couleur={DS.primary}
          adresse="Pas interactif"
          statut="termine"
          counts={{ notes: 1 }}
        />
      </View>

      {/* ════════════════════════════════════════════════════════
          SECTION 8 — ChantierDashboardCard
      ════════════════════════════════════════════════════════ */}
      <View style={styles.block}>
        <SectionHeader title="Section 8 — ChantierDashboardCard" size="lg" separator />

        <SectionHeader title="8.1  Cas complet (fiche + 2 boutons + statut)" uppercase size="sm" style={styles.sub} />
        <ChantierDashboardCard
          nom="Villa Martin"
          couleur={DS.accent}
          adresse="12 rue de la Paix"
          statut="actif"
          ficheInfo={{
            codeAcces:      'A12-3456',
            emplacementCle: 'Sous le pot de fleurs',
            codeAlarme:     '4242',
          }}
          photosCount={18}
          onPress={() => {}}
          onPhotosPress={() => {}}
          onNavigatePress={() => {}}
        />

        <SectionHeader title="8.2  Sans fiche info (section masquée)" uppercase size="sm" style={styles.sub} />
        <ChantierDashboardCard
          nom="Extension Durand"
          couleur={DS.info}
          adresse="3 avenue des Lilas"
          statut="actif"
          photosCount={3}
          onPhotosPress={() => {}}
          onNavigatePress={() => {}}
        />

        <SectionHeader title="8.3  Fiche partielle (un seul champ)" uppercase size="sm" style={styles.sub} />
        <ChantierDashboardCard
          nom="Rénovation toiture"
          couleur={DS.warning}
          adresse="Impasse des peupliers"
          statut="en_attente"
          ficheInfo={{ codeAcces: 'TOIT-2026' }}
          onPhotosPress={() => {}}
          onNavigatePress={() => {}}
        />

        <SectionHeader title="8.4  Un seul bouton (Photos seul)" uppercase size="sm" style={styles.sub} />
        <ChantierDashboardCard
          nom="Sans navigation"
          couleur={DS.success}
          adresse="Uniquement photos"
          photosCount={7}
          onPhotosPress={() => {}}
        />

        <SectionHeader title="8.5  Minimal (aucun extra)" uppercase size="sm" style={styles.sub} />
        <ChantierDashboardCard
          nom="Carte minimale"
          couleur={DS.textAlt}
          adresse="Rien de plus"
        />
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: DS.background,
  },
  content: {
    padding:       space.lg,
    paddingBottom: space.xxxl,
  },

  // En-tête de page
  pageTitle: {
    fontSize:     font.xl,
    fontWeight:   font.bold,
    color:        DS.textStrong,
    marginBottom: space.xs,
  },
  pageSub: {
    fontSize: font.sm,
    color:    DS.textAlt,
  },

  // Blocs de section
  block: {
    marginTop: space.xxxl,
  },
  sub: {
    marginTop:    space.lg,
    marginBottom: space.sm,
  },

  // Rows StatusBadge
  row: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    columnGap:     space.sm,
    rowGap:        space.sm,
  },

  // Boîtes démo SectionHeader
  demoBox: {
    borderWidth:   1,
    borderColor:   DS.borderAlt,
    borderRadius:  radius.sm,
    padding:       space.md,
    backgroundColor: DS.surface,
  },
  demoBoxTop: {
    marginTop: space.sm,
  },

  // Actions dans SectionHeader
  actionAccent: {
    color:      DS.accent,
    fontWeight: font.semibold,
    fontSize:   font.lg,
  },
  actionInfo: {
    color:      DS.info,
    fontWeight: font.medium,
    fontSize:   font.body,
  },
  badgeGroup: {
    flexDirection: 'row',
    gap:           space.xs,
  },

  // Containers EmptyState
  emptyContainer: {
    height:          200,
    borderWidth:     1,
    borderColor:     DS.borderAlt,
    borderRadius:    radius.sm,
    overflow:        'hidden',
    backgroundColor: DS.surface,
  },
  emptyFill: {
    flex: 1,
  },
  inlineBox: {
    borderWidth:     1,
    borderColor:     DS.borderAlt,
    borderRadius:    radius.sm,
    backgroundColor: DS.surface,
  },
  emoji: {
    fontSize: 36,
  },

  // Bouton CTA (démo forward-compat)
  demoBtn: {
    backgroundColor:  DS.primary,
    paddingHorizontal: space.lg,
    paddingVertical:  space.sm,
    borderRadius:     radius.md,
  },
  demoBtnText: {
    color:      DS.textInverse,
    fontWeight: font.semibold,
    fontSize:   font.body,
  },

  // FilterChip section 6
  chipDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },

  // StatusBadge section 3
  iconBox: {
    width:           10,
    height:          10,
    borderRadius:    2,
    backgroundColor: DS.textInverse,
  },
});

import React from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { DS, font, radius, space } from '../../constants/design';
import { StatusBadge } from './StatusBadge';
import {
  ChantierCardHeader,
  type StatutChantier,
} from './ChantierCardHeader';

// ─── Types auxiliaires ────────────────────────────────────────────────────────

/** Rôle d'un contact rattaché à un chantier. */
export type ContactRole =
  | 'architecte'
  | 'apporteur'
  | 'sous_traitant'
  | 'client';

/**
 * Contact rattaché à un chantier — rendu sous forme de badge coloré par rôle.
 * Volontairement minimal : pas de `id`, pas de lien vers le modèle `Contact`
 * global (découplage intentionnel).
 */
export interface ChantierContact {
  /** Rôle — détermine couleur, emoji et label via `CONTACT_ROLE_META`. */
  role: ContactRole;
  /** Nom affiché dans le badge. */
  nom: string;
}

/**
 * Employé assigné à un chantier — rendu sous forme de badge en couleur métier.
 * `metierColor` est la couleur opaque du métier (ex: `DS.accent` pour maçonnerie) ;
 * le fond "soft" est dérivé automatiquement par le composant.
 */
export interface ChantierEmployee {
  /** Nom affiché dans le badge. */
  nom: string;
  /** Couleur opaque du métier — utilisée pour le texte du badge et pour dériver le fond soft. */
  metierColor: string;
}

/**
 * Compteurs affichés en bas de carte.
 * - Clé `undefined` → compteur masqué.
 * - Valeur `0` → compteur affiché avec "0".
 */
export interface ChantierCounts {
  notes?: number;
  plans?: number;
  photos?: number;
  achats?: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * Props du composant `ChantierListCard`.
 *
 * Carte complète pour la vue liste des chantiers. Compose `ChantierCardHeader`
 * (nom + adresse + statut) avec les sections spécifiques : dates, contacts,
 * employés et compteurs.
 *
 * Toutes les props "données" sont granulaires — le composant ne connaît pas
 * le type `Chantier` global. L'appelant compose les valeurs à passer.
 */
export interface ChantierListCardProps {
  // ── Header (transférés à ChantierCardHeader) ──
  /** Nom du chantier. */
  nom: string;
  /** Couleur d'identification — matérialisée en bordure gauche de la carte. */
  couleur: string;
  /** Adresse déjà composée par l'appelant. Masquée si vide. */
  adresse?: string;
  /** Statut optionnel — affiché en badge à droite du nom si fourni. */
  statut?: StatutChantier;

  // ── Spécifique liste ──
  /** Date de début (chaîne déjà formatée par l'appelant). */
  dateDebut?: string;
  /** Date de fin (chaîne déjà formatée par l'appelant). */
  dateFin?: string;
  /** Contacts à afficher en badges — masqué si `undefined` ou tableau vide. */
  contacts?: ChantierContact[];
  /** Employés assignés — masqué si `undefined` ou tableau vide. */
  employes?: ChantierEmployee[];
  /** Compteurs — masqué si `undefined` ou si toutes les clés sont `undefined`. */
  counts?: ChantierCounts;

  // ── Interaction ──
  /** Callback au tap sur la carte. Si absent, la carte est non-interactive. */
  onPress?: () => void;

  style?: StyleProp<ViewStyle>;
}

// ─── Records statiques (emojis + méta) ────────────────────────────────────────

/**
 * Méta visuelle par rôle de contact. Centralise emoji + label + couleurs.
 * Migration future (Phase 4 — lucide icons) : ne toucher que ce record.
 */
const CONTACT_ROLE_META: Record<
  ContactRole,
  { emoji: string; label: string; bg: string; color: string }
> = {
  architecte:    { emoji: '🏛', label: 'Architecte',    bg: DS.infoSoft,    color: DS.info },
  apporteur:     { emoji: '👤', label: 'Apporteur',     bg: DS.surfaceAlt,  color: DS.textAlt },
  sous_traitant: { emoji: '🔧', label: 'Sous-traitant', bg: DS.warningSoft, color: DS.warning },
  client:        { emoji: '🤝', label: 'Client',        bg: DS.successSoft, color: DS.success },
};

/**
 * Méta visuelle par type de compteur. Centralise emoji + label.
 * Migration future (Phase 4) : ne toucher que ce record.
 */
const COUNT_META: Record<
  keyof ChantierCounts,
  { emoji: string; label: string }
> = {
  notes:  { emoji: '📝', label: 'Notes' },
  plans:  { emoji: '📐', label: 'Plans' },
  photos: { emoji: '📸', label: 'Photos' },
  achats: { emoji: '🛒', label: 'Achats' },
};

/** Ordre d'affichage fixe des compteurs (matche l'inventaire P1). */
const COUNT_ORDER: Array<keyof ChantierCounts> = [
  'notes',
  'plans',
  'photos',
  'achats',
];

// ─── Constantes internes ──────────────────────────────────────────────────────

// Valeur fine non couverte par les tokens du design system
const CARD_BORDER_LEFT_WIDTH = 4;

// Suffixe hex (~9%) pour dériver le fond "soft" d'une couleur métier opaque.
// Convention établie dans l'app (cf. StatusBadge — palettes métier).
const METIER_SOFT_ALPHA = '18';

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Carte chantier pour vue liste — assemble `ChantierCardHeader` avec les
 * sections dates, contacts, employés et compteurs.
 *
 * La bordure gauche colorée est portée par la carte elle-même (pas par le
 * header), pour traverser toute la hauteur.
 *
 * @example Usage complet
 * ```tsx
 * <ChantierListCard
 *   nom={chantier.nom}
 *   couleur={chantier.couleur}
 *   adresse={[chantier.rue, chantier.ville].filter(Boolean).join(', ')}
 *   statut={chantier.statut}
 *   dateDebut={chantier.dateDebut}
 *   dateFin={chantier.dateFin}
 *   contacts={[
 *     { role: 'architecte', nom: 'M. Dupont' },
 *     { role: 'client',     nom: 'Famille Martin' },
 *   ]}
 *   employes={[
 *     { nom: 'Jean', metierColor: DS.accent },
 *     { nom: 'Paul', metierColor: DS.info },
 *   ]}
 *   counts={{ notes: 3, plans: 1, photos: 12, achats: 0 }}
 *   onPress={() => openChantier(chantier.id)}
 * />
 * ```
 */
export function ChantierListCard({
  nom,
  couleur,
  adresse,
  statut,
  dateDebut,
  dateFin,
  contacts,
  employes,
  counts,
  onPress,
  style,
}: ChantierListCardProps): React.ReactElement {
  const isInteractive  = onPress !== undefined;
  const hasAnyDate     = dateDebut !== undefined || dateFin !== undefined;
  const hasContacts    = contacts !== undefined && contacts.length > 0;
  const hasEmployes    = employes !== undefined && employes.length > 0;
  const visibleCounts  = counts !== undefined
    ? COUNT_ORDER.filter(key => counts[key] !== undefined)
    : [];
  const hasCounts      = visibleCounts.length > 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      accessibilityRole={isInteractive ? 'button' : undefined}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: couleur },
        pressed && isInteractive && styles.cardPressed,
        style,
      ]}
    >
      <ChantierCardHeader nom={nom} adresse={adresse} statut={statut} />

      {hasAnyDate && (
        <Text style={styles.dates}>
          {dateDebut ?? '—'} → {dateFin ?? '—'}
        </Text>
      )}

      {hasContacts && (
        <View style={styles.badgeRow}>
          {contacts.map((c, i) => {
            const meta = CONTACT_ROLE_META[c.role];
            return (
              <StatusBadge
                key={`contact-${c.role}-${i}`}
                label={`${meta.emoji} ${c.nom}`}
                bg={meta.bg}
                color={meta.color}
                size="sm"
              />
            );
          })}
        </View>
      )}

      {hasEmployes && (
        <View style={styles.badgeRow}>
          {employes.map((e, i) => (
            <StatusBadge
              key={`emp-${e.nom}-${i}`}
              label={e.nom}
              bg={e.metierColor + METIER_SOFT_ALPHA}
              color={e.metierColor}
              size="sm"
            />
          ))}
        </View>
      )}

      {hasCounts && (
        <View style={styles.countsRow}>
          {visibleCounts.map(key => {
            const value = counts![key] as number;
            const meta  = COUNT_META[key];
            return (
              <Text
                key={`count-${key}`}
                style={styles.countText}
                accessibilityLabel={`${meta.label}: ${value}`}
              >
                {`${meta.emoji} ${value}`}
              </Text>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: DS.surface,
    borderRadius:    radius.md,           // 12
    borderWidth:     1,
    borderColor:     DS.border,
    borderLeftWidth: CARD_BORDER_LEFT_WIDTH, // 4
    padding:         space.md,            // 12
  },

  cardPressed: {
    opacity: 0.85,
  },

  dates: {
    fontSize:   font.compact,  // 11
    fontWeight: font.normal,   // '400'
    color:      DS.textAlt,
    marginTop:  space.xs,      // 4
  },

  badgeRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    columnGap:     space.xs,   // 4
    rowGap:        space.xs,   // 4
    marginTop:     space.sm,   // 8
  },

  countsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    columnGap:     space.md,   // 12
    rowGap:        space.xs,   // 4
    marginTop:     space.sm,   // 8
  },

  countText: {
    fontSize:   font.compact,  // 11
    fontWeight: font.medium,   // '500'
    color:      DS.textAlt,
  },
});

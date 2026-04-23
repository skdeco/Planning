import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { DS, font, space } from '../../constants/design';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Date locale YYYY-MM-DD (pas UTC — évite les décalages minuit-aube). */
function toYMDLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Regex stricte pour valider un format YYYY-MM-DD. */
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nombre de jours entre deux dates YYYY-MM-DD. Ancrage 12h00 locale pour
 * éviter les bascules liées au changement d'heure (DST). Retour positif si
 * `toYmd` > `fromYmd`, négatif sinon.
 */
function daysBetween(fromYmd: string, toYmd: string): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const from = new Date(fromYmd + 'T12:00:00').getTime();
  const to   = new Date(toYmd + 'T12:00:00').getTime();
  return Math.ceil((to - from) / MS_PER_DAY);
}

/** Format FR "JJ/MM/AAAA" depuis un YYYY-MM-DD. Ancrage 12h locale (cohérent avec daysBetween). */
function formatDateFR(ymd: string): string {
  return new Date(ymd + 'T12:00:00').toLocaleDateString('fr-FR');
}

/** Type-guard : chantier actif avec une `dateFin` définie et bien formée. */
function isActifAvecDateValide(
  c: AlerteChantier,
): c is AlerteChantier & { dateFin: string } {
  return (
    c.statut === 'actif'
    && c.dateFin !== undefined
    && YMD_PATTERN.test(c.dateFin)
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Forme minimale d'un chantier pour l'analyse des alertes de fin.
 * Volontairement découplée du type `Chantier` global (4 champs seulement) —
 * le composant ne dépend pas du modèle de données applicatif.
 */
export interface AlerteChantier {
  id: string;
  nom: string;
  /** Format attendu : YYYY-MM-DD. Les valeurs vides ou mal formées sont ignorées. */
  dateFin?: string;
  /** Seuls les chantiers `statut === 'actif'` déclenchent des alertes. */
  statut: string;
}

/**
 * Props du composant `AlertesChantiersRetard`.
 *
 * Le composant fait son propre filtrage (statut actif + date valide) et ne
 * rend rien si aucune alerte n'est détectée. Le parent n'a qu'à fournir la
 * liste brute de chantiers.
 */
export interface AlertesChantiersRetardProps {
  /** Liste des chantiers à analyser. */
  chantiers: AlerteChantier[];
}

// ─── Constantes internes ──────────────────────────────────────────────────────

/** Seuil en jours pour considérer un chantier actif comme "proche de la fin". */
const PROCHE_FIN_SEUIL_JOURS = 7;

/**
 * Texte rouge foncé pour le titre et les détails "en retard".
 * Local car plus foncé que `DS.error` — nécessaire pour un contraste
 * suffisant sur fond `DS.errorSoft`. À promouvoir en `DS.errorStrong`
 * si le pattern se reproduit ailleurs.
 */
const ALERTE_TEXT_ERROR = '#B71C1C';

/**
 * Texte ambre foncé pour le titre et les détails "fin proche".
 * Local car plus foncé que `DS.warning` — même raison de contraste que
 * `ALERTE_TEXT_ERROR`. À promouvoir en `DS.warningStrong` si besoin.
 */
const ALERTE_TEXT_WARNING = '#856404';

/** Padding interne de la bannière (fine : entre `space.sm=8` et `space.md=12`). */
const ALERTE_PADDING = 10;

/** Border-radius de la bannière (fine : entre `radius.sm=8` et `radius.md=12`). */
const ALERTE_RADIUS = 10;

/** Largeur de la bordure gauche colorée (accent identitaire). */
const ALERTE_BORDER_LEFT_WIDTH = 4;

/** Taille du toggle ▲/▼ (fine : entre `font.body=13` et `font.subhead=15`). */
const ALERTE_FS_TOGGLE = 14;

/** Taille des lignes de détail (fine : entre `font.compact=11` et `font.body=13`). */
const ALERTE_FS_DETAIL = 12;

/** Gap vertical entre lignes de détail (fine : entre `space.xs=4` et `space.sm=8`). */
const ALERTE_GAP = 6;

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Bannière pliable listant les chantiers en retard (dateFin dépassée) et
 * ceux dont la fin approche (≤ 7 jours). Ne rend rien si aucune alerte.
 *
 * Purement présentationnel : aucun side-effect, aucune mutation d'état global.
 * Le gating admin est la responsabilité du parent — le composant ne connaît
 * pas les règles de visibilité applicatives.
 *
 * @example
 * ```tsx
 * {isAdmin && (
 *   <AlertesChantiersRetard chantiers={data.chantiers} />
 * )}
 * ```
 */
export function AlertesChantiersRetard({
  chantiers,
}: AlertesChantiersRetardProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);

  const today = toYMDLocal(new Date());

  const actifsAvecDate = chantiers.filter(isActifAvecDateValide);

  const chantiersEnRetard = actifsAvecDate.filter(c => c.dateFin < today);

  const chantiersProches = actifsAvecDate.filter(c => {
    if (c.dateFin < today) return false;
    return daysBetween(today, c.dateFin) <= PROCHE_FIN_SEUIL_JOURS;
  });

  const totalAlertes = chantiersEnRetard.length + chantiersProches.length;
  if (totalAlertes === 0) return null;

  const hasRetard   = chantiersEnRetard.length > 0;
  const bgColor     = hasRetard ? DS.errorSoft : DS.warningSoft;
  const borderColor = hasRetard ? DS.error     : DS.warning;
  const titleColor  = hasRetard ? ALERTE_TEXT_ERROR : ALERTE_TEXT_WARNING;

  return (
    <Pressable
      onPress={() => setExpanded(v => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={[
        styles.container,
        { backgroundColor: bgColor, borderLeftColor: borderColor },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: titleColor }]}>
          ⚠️ {totalAlertes} alerte{totalAlertes > 1 ? 's' : ''} chantier{totalAlertes > 1 ? 's' : ''}
          {hasRetard ? ` (${chantiersEnRetard.length} en retard)` : ''}
        </Text>
        <Text style={styles.toggleArrow}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {expanded && (
        <View style={styles.detailSection}>
          {chantiersEnRetard.map(c => {
            const jours = daysBetween(c.dateFin, today);
            return (
              <Text
                key={c.id}
                style={[styles.detailLine, { color: ALERTE_TEXT_ERROR }]}
              >
                • {c.nom} — fin prévue le {formatDateFR(c.dateFin)} ({jours}j de retard)
              </Text>
            );
          })}
          {chantiersProches.map(c => {
            const jours = daysBetween(today, c.dateFin);
            return (
              <Text
                key={c.id}
                style={[styles.detailLine, { color: ALERTE_TEXT_WARNING }]}
              >
                • {c.nom} — fin le {formatDateFR(c.dateFin)} ({jours}j restant{jours > 1 ? 's' : ''})
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
  container: {
    marginHorizontal: space.md,                // 12
    marginTop:        space.sm,                // 8
    padding:          ALERTE_PADDING,          // 10
    borderRadius:     ALERTE_RADIUS,           // 10
    borderLeftWidth:  ALERTE_BORDER_LEFT_WIDTH, // 4
  },

  headerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },

  title: {
    fontSize:   font.body, // 13
    fontWeight: font.bold, // '700'
  },

  toggleArrow: {
    fontSize: ALERTE_FS_TOGGLE, // 14
    color:    DS.textAlt,
  },

  detailSection: {
    marginTop: space.sm, // 8
    gap:       ALERTE_GAP, // 6
  },

  detailLine: {
    fontSize:   ALERTE_FS_DETAIL, // 12
    marginLeft: space.sm,          // 8
  },
});

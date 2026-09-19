import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Info,
  LayoutGrid,
  CheckSquare,
  ClipboardList,
  Camera,
  Navigation,
  Briefcase,
  Wrench,
  ShoppingCart,
  FileCheck,
  TrendingUp,
  MessageCircle,
  Truck,
  FolderOpen,
  CheckCircle2,
  Trash2,
  User,
  Pencil,
  Package,
  Wallet,
  Receipt,
  CalendarRange,
  Ruler,
  Landmark,
  Scale,
  Users,
  Flag,
  HardHat,
  FilePlus,
  ChevronRight,
  Eye,
  type LucideIcon,
} from 'lucide-react-native';
import { DS, radius, shadows, font } from '@/constants/design';
import type { TileKey, TileMode } from '@/lib/portail/dashboardAccess';

/**
 * ChantierDetailDashboard — Vue d'ensemble d'un chantier (refonte sept. 2026).
 * 4 actions rapides + 4 sections (Suivi / Finances / Documents / Équipe) présentées
 * en listes, à la place de l'ancienne grille de 27 tuiles.
 *
 * Composant purement présentationnel : counts + handlers passés en props,
 * toute la logique métier (récupération counts, ouverture modals) reste dans
 * le parent. Les tuiles sont regroupées par famille pour hiérarchiser la vue.
 */
export interface ChantierDetailDashboardCounts {
  notes: number;
  plans: number;
  photos: number;
  achats: number;
  marches: number;
  notesPlanning: number;
  sav: number;
  livraisons: number;
  messages?: number;
}

export interface ChantierDetailDashboardHandlers {
  onPressFiche: () => void;
  onPressPlans: () => void;
  onPressNotes: () => void;
  onPressSuivis: () => void;
  onPressPrescriptions: () => void;
  onPressBudget: () => void;
  onPressMetres: () => void;
  onPressPhases: () => void;
  onPressAdministratif: () => void;
  onPressConsultation: () => void;
  onPressAnnuaire: () => void;
  onPressJournal: () => void;
  onPressSousTraitants: () => void;
  onPressPhotos: () => void;
  onPressYAller: () => void;
  onPressMarches: () => void;
  onPressSAV: () => void;
  onPressAchats: () => void;
  onPressPV: () => void;
  onPressRentabilite: () => void;
  onPressLivraison: () => void;
  onPressMessagerie: () => void;
  /** Drive documentaire du chantier (devis, références, factures). */
  onPressDrive: () => void;
  /** Aperçu du portail client (vue qu'aura le client connecté). */
  onPressPortailClient: () => void;
  /** Portail uniquement : honoraires architecte (privé archi↔client). */
  onPressHonoraires?: () => void;
  /** Portail uniquement : finances client (Travaux + Honoraires, lecture). */
  onPressFinances?: () => void;
  /** Si undefined, bouton "Modifier" masqué. */
  onPressEdit?: () => void;
  /** Si undefined, bouton "Clôturer" masqué (ex: chantier déjà terminé ou pas admin) */
  onPressCloturer?: () => void;
  /** Si undefined, bouton "Supprimer" masqué (ex: pas admin) */
  onPressSupprimer?: () => void;
}

export interface ChantierDetailDashboardProps {
  isAdmin: boolean;
  counts: ChantierDetailDashboardCounts;
  handlers: ChantierDetailDashboardHandlers;
  /**
   * Mode PORTAIL : si fourni, la visibilité de chaque tuile suit ce résolveur
   * (agir / lecture / masqué) au lieu du filtre admin. L'admin ne passe pas ce prop.
   */
  access?: (key: TileKey) => TileMode;
}

interface TileSpec {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  badge?: number;
  adminOnly?: boolean;
  /** Clé pour le résolveur d'accès portail (absente = jamais affichée au portail). */
  key?: TileKey;
  /** Entrée réservée au portail (jamais affichée à l'admin), ex. Honoraires, Mes finances. */
  portalOnly?: boolean;
}

type SectionId = 'suivi' | 'finances' | 'documents' | 'equipe';

export function ChantierDetailDashboard({
  isAdmin,
  counts,
  handlers,
  access,
}: ChantierDetailDashboardProps) {
  const noop = () => {};
  const resolveMode = (tile: TileSpec): TileMode => {
    if (access) return tile.key ? access(tile.key) : 'hidden';
    if (tile.portalOnly) return 'hidden';
    return tile.adminOnly && !isAdmin ? 'hidden' : 'act';
  };

  // Actions rapides (toujours visibles en haut de la fiche).
  const quick: TileSpec[] = [
    { icon: Navigation,  label: 'Y aller', key: 'yAller', onPress: handlers.onPressYAller },
    { icon: Camera,      label: 'Photos',  key: 'photos', onPress: handlers.onPressPhotos, badge: counts.photos },
    { icon: CheckSquare, label: 'Notes',   key: 'notes',  onPress: handlers.onPressNotes,  badge: counts.notes },
    { icon: Info,        label: 'Infos',   key: 'fiche',  onPress: handlers.onPressFiche },
  ];

  const sections: { id: SectionId; titre: string; tiles: TileSpec[] }[] = [
    {
      id: 'suivi',
      titre: 'Suivi',
      tiles: [
        { icon: CheckSquare,   label: 'Notes',           key: 'notes',     onPress: handlers.onPressNotes,     badge: counts.notes },
        { icon: ClipboardList, label: 'Comptes rendus',  key: 'suivis',    onPress: handlers.onPressSuivis,    badge: counts.notesPlanning },
        { icon: Camera,        label: 'Photos',          key: 'photos',    onPress: handlers.onPressPhotos,    badge: counts.photos },
        { icon: LayoutGrid,    label: 'Plans',           key: 'plans',     onPress: handlers.onPressPlans,     badge: counts.plans },
        { icon: CalendarRange, label: 'Phases',          key: 'phases',    onPress: handlers.onPressPhases },
        { icon: Truck,         label: 'Livraisons',      key: 'livraison', onPress: handlers.onPressLivraison, badge: counts.livraisons },
      ],
    },
    {
      id: 'finances',
      titre: 'Finances',
      tiles: [
        { icon: Briefcase,    label: 'Marchés',      key: 'marches',      onPress: handlers.onPressMarches,      badge: counts.marches, adminOnly: true },
        { icon: ShoppingCart, label: 'Achats',       key: 'achats',       onPress: handlers.onPressAchats,       badge: counts.achats,  adminOnly: true },
        { icon: TrendingUp,   label: 'Rentabilité',  key: 'rentabilite',  onPress: handlers.onPressRentabilite,  adminOnly: true },
        { icon: Wallet,       label: 'Budget',       key: 'budget',       onPress: handlers.onPressBudget },
        { icon: Ruler,        label: 'Métrés',       key: 'metres',       onPress: handlers.onPressMetres },
        { icon: Scale,        label: 'Consultation', key: 'consultation', onPress: handlers.onPressConsultation, adminOnly: true },
        { icon: Receipt,      label: 'Honoraires',   key: 'honoraires',   onPress: handlers.onPressHonoraires ?? noop, portalOnly: true },
        { icon: Wallet,       label: 'Mes finances', key: 'finances',     onPress: handlers.onPressFinances ?? noop,   portalOnly: true },
      ],
    },
    {
      id: 'documents',
      titre: 'Documents',
      tiles: [
        { icon: FolderOpen, label: 'Documents',       key: 'drive',         onPress: handlers.onPressDrive,         adminOnly: true },
        { icon: Info,       label: 'Infos utiles',    key: 'fiche',         onPress: handlers.onPressFiche },
        { icon: Package,    label: 'Prescriptions',   key: 'prescriptions', onPress: handlers.onPressPrescriptions },
        { icon: FileCheck,  label: 'PV de réception', key: 'pv',            onPress: handlers.onPressPV,            adminOnly: true },
        { icon: Landmark,   label: 'Administratif',   key: 'administratif', onPress: handlers.onPressAdministratif, adminOnly: true },
        { icon: Wrench,     label: 'SAV',             key: 'sav',           onPress: handlers.onPressSAV,           badge: counts.sav, adminOnly: true },
      ],
    },
    {
      id: 'equipe',
      titre: 'Équipe',
      tiles: [
        { icon: HardHat,       label: 'Sous-traitants', key: 'sousTraitants', onPress: handlers.onPressSousTraitants, adminOnly: true },
        { icon: Users,         label: 'Annuaire',       key: 'annuaire',      onPress: handlers.onPressAnnuaire },
        { icon: User,          label: 'Portail client',                       onPress: handlers.onPressPortailClient, adminOnly: true },
        { icon: MessageCircle, label: 'Messagerie',     key: 'messagerie',    onPress: handlers.onPressMessagerie,    badge: counts.messages, adminOnly: true },
      ],
    },
  ];

  const visibles = sections
    .map(sec => ({ ...sec, rows: sec.tiles.map(tile => ({ tile, mode: resolveMode(tile) })).filter(x => x.mode !== 'hidden') }))
    .filter(sec => sec.rows.length > 0);
  const quickVisibles = quick.map(tile => ({ tile, mode: resolveMode(tile) })).filter(x => x.mode !== 'hidden');

  const [sectionId, setSectionId] = useState<SectionId>('suivi');
  const current = useMemo(
    () => visibles.find(sec => sec.id === sectionId) ?? visibles[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionId, visibles.map(v => v.id + v.rows.length).join('|')],
  );

  const tap = (fn: () => void) => () => {
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    fn();
  };

  const hasFooterActions =
    isAdmin && (
      handlers.onPressEdit !== undefined ||
      handlers.onPressCloturer !== undefined ||
      handlers.onPressSupprimer !== undefined
    );

  return (
    <View style={styles.container}>
      {quickVisibles.length > 0 && (
        <View style={styles.quickRow}>
          {quickVisibles.map(({ tile }) => {
            const Icon = tile.icon;
            return (
              <Pressable
                key={`q-${tile.label}`}
                accessibilityRole="button"
                accessibilityLabel={tile.label}
                onPress={tap(tile.onPress)}
                style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
              >
                <Icon size={22} color={DS.primary} strokeWidth={1.9} />
                <Text style={styles.quickLabel} numberOfLines={1}>{tile.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {visibles.length > 1 && (
        <View style={styles.segment} accessibilityRole="tablist">
          {visibles.map(sec => {
            const on = sec.id === current?.id;
            return (
              <Pressable
                key={sec.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={tap(() => setSectionId(sec.id))}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>{sec.titre}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {current && (
        <View style={styles.card}>
          {current.rows.map(({ tile, mode }, i) => {
            const Icon = tile.icon;
            const last = i === current.rows.length - 1;
            return (
              <Pressable
                key={`${tile.label}-${i}`}
                accessibilityRole="button"
                onPress={tap(tile.onPress)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowIcon}>
                  <Icon size={18} color={DS.primary} strokeWidth={1.9} />
                </View>
                <View style={[styles.rowInner, !last && styles.rowSeparator]}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{tile.label}</Text>
                  {mode === 'read' && <Eye size={15} color={DS.textSecondary} strokeWidth={1.9} />}
                  {!!tile.badge && tile.badge > 0 && <Text style={styles.rowDetail}>{tile.badge}</Text>}
                  <ChevronRight size={16} color={DS.textSecondary} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {hasFooterActions && (
        <View style={styles.footer}>
          {handlers.onPressEdit && (
            <Pressable onPress={handlers.onPressEdit} style={styles.footerBtn}>
              <Pencil size={16} color={DS.bordeaux} strokeWidth={2} />
              <Text style={styles.footerBtnText}>Modifier le chantier</Text>
            </Pressable>
          )}
          {handlers.onPressCloturer && (
            <Pressable onPress={handlers.onPressCloturer} style={styles.footerBtn}>
              <CheckCircle2 size={16} color={DS.bordeaux} strokeWidth={2} />
              <Text style={styles.footerBtnText}>Clôturer le chantier</Text>
            </Pressable>
          )}
          {handlers.onPressSupprimer && (
            <Pressable onPress={handlers.onPressSupprimer} style={styles.footerBtnDanger}>
              <Trash2 size={16} color={DS.error} strokeWidth={2} />
              <Text style={[styles.footerBtnText, styles.footerBtnDangerText]}>
                Supprimer le chantier
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  pressed: { opacity: 0.6 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: {
    flex: 1, height: 68, borderRadius: radius.lg, backgroundColor: DS.surface,
    alignItems: 'center', justifyContent: 'center', gap: 5, ...shadows.sm,
  },
  quickLabel: { fontSize: 12, fontWeight: font.medium, color: DS.primary },
  segment: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: radius.full, backgroundColor: DS.segment },
  segmentItem: { flex: 1, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentItemOn: { backgroundColor: DS.surface, ...shadows.sm },
  segmentText: { fontSize: 13, fontWeight: font.medium, color: DS.text },
  segmentTextOn: { fontWeight: font.semibold },
  card: { backgroundColor: DS.surface, borderRadius: radius.xl, ...shadows.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingLeft: 14 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: DS.soft, alignItems: 'center', justifyContent: 'center' },
  rowInner: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  rowSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DS.border },
  rowTitle: { flex: 1, fontSize: font.lg, color: DS.text },
  rowDetail: { fontSize: font.subhead, color: DS.textSecondary },
  footer: { gap: 8, marginTop: 4 },
  footerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.full, backgroundColor: DS.soft,
  },
  footerBtnDanger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.full, backgroundColor: DS.errorSoft,
  },
  footerBtnText: { fontSize: 13, fontWeight: '600', color: DS.bordeaux },
  footerBtnDangerText: { color: DS.error },
});

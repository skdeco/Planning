import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
  History,
  Flag,
  HardHat,
  FilePlus,
  type LucideIcon,
} from 'lucide-react-native';
import { DS } from '@/constants/design';
import { SectionTile } from './SectionTile';
import type { TileKey, TileMode } from '@/lib/portail/dashboardAccess';

/**
 * ChantierDetailDashboard — Grille de tuiles pour la vue d'ensemble d'un chantier (palette V10).
 * Remplace le menu d'actions emoji historique dans la modal `actionChantier` de chantiers.tsx.
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
  variant: 'bordeaux' | 'marron';
  onPress: () => void;
  badge?: number;
  adminOnly?: boolean;
  /** Clé pour le résolveur d'accès portail (absente = jamais affichée au portail). */
  key?: TileKey;
  /** Tuile réservée au portail (jamais affichée à l'admin), ex. Honoraires, Mes finances. */
  portalOnly?: boolean;
}

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
  // Tuiles regroupées par famille pour hiérarchiser (plutôt que 14 tuiles à plat).
  const groups: { titre: string; tiles: TileSpec[] }[] = [
    {
      titre: 'Conception',
      tiles: [
        { icon: Package, label: 'Prescriptions', key: 'prescriptions', variant: 'bordeaux', onPress: handlers.onPressPrescriptions },
        { icon: Wallet,  label: 'Budget',        key: 'budget',        variant: 'bordeaux', onPress: handlers.onPressBudget },
        { icon: Ruler,   label: 'Métrés',        key: 'metres',        variant: 'bordeaux', onPress: handlers.onPressMetres },
        { icon: Receipt, label: 'Honoraires',    key: 'honoraires',    variant: 'bordeaux', onPress: handlers.onPressHonoraires ?? noop, portalOnly: true },
        { icon: Wallet,  label: 'Mes finances',  key: 'finances',      variant: 'bordeaux', onPress: handlers.onPressFinances ?? noop, portalOnly: true },
      ],
    },
    {
      titre: 'Suivi & terrain',
      tiles: [
        { icon: CheckSquare,   label: 'Notes',     key: 'notes',   variant: 'bordeaux', onPress: handlers.onPressNotes,  badge: counts.notes },
        { icon: Camera,        label: 'Photos',    key: 'photos',  variant: 'marron',   onPress: handlers.onPressPhotos, badge: counts.photos },
        { icon: ClipboardList, label: 'Suivis CR', key: 'suivis',  variant: 'bordeaux', onPress: handlers.onPressSuivis, badge: counts.notesPlanning },
        { icon: CalendarRange, label: 'Phases',    key: 'phases',  variant: 'bordeaux', onPress: handlers.onPressPhases },
        { icon: History,       label: 'Journal',   key: 'journal', variant: 'bordeaux', onPress: handlers.onPressJournal },
        { icon: Navigation,    label: 'Y aller',   key: 'yAller',  variant: 'marron',   onPress: handlers.onPressYAller },
      ],
    },
    {
      titre: 'Finances',
      tiles: [
        { icon: Briefcase,    label: 'Marchés',     key: 'marches',       variant: 'bordeaux', onPress: handlers.onPressMarches,     badge: counts.marches, adminOnly: true },
        { icon: ShoppingCart, label: 'Achats',      key: 'achats',        variant: 'marron',   onPress: handlers.onPressAchats,      badge: counts.achats,  adminOnly: true },
        { icon: TrendingUp,   label: 'Rentabilité', key: 'rentabilite',   variant: 'bordeaux', onPress: handlers.onPressRentabilite, adminOnly: true },
        { icon: HardHat,      label: 'Sous-traitants', key: 'sousTraitants', variant: 'marron', onPress: handlers.onPressSousTraitants, adminOnly: true },
        { icon: Scale,        label: 'Consultation',key: 'consultation',  variant: 'bordeaux', onPress: handlers.onPressConsultation, adminOnly: true },
      ],
    },
    {
      titre: 'Documents & réception',
      tiles: [
        { icon: FolderOpen, label: 'Documents',    key: 'drive',         variant: 'bordeaux', onPress: handlers.onPressDrive, adminOnly: true },
        { icon: Info,       label: 'Infos utiles', key: 'fiche',         variant: 'bordeaux', onPress: handlers.onPressFiche },
        { icon: LayoutGrid, label: 'Plans',        key: 'plans',         variant: 'bordeaux', onPress: handlers.onPressPlans,     badge: counts.plans },
        { icon: FileCheck,  label: 'PV réception', key: 'pv',            variant: 'bordeaux', onPress: handlers.onPressPV,        adminOnly: true },
        { icon: Landmark,   label: 'Administratif',key: 'administratif', variant: 'bordeaux', onPress: handlers.onPressAdministratif, adminOnly: true },
        { icon: Truck,      label: 'Livraison',    key: 'livraison',     variant: 'marron',   onPress: handlers.onPressLivraison, badge: counts.livraisons },
      ],
    },
    {
      titre: 'Client & SAV',
      tiles: [
        { icon: Wrench,        label: 'SAV',            key: 'sav',        variant: 'bordeaux', onPress: handlers.onPressSAV,           badge: counts.sav, adminOnly: true },
        { icon: User,          label: 'Portail client',                    variant: 'marron',   onPress: handlers.onPressPortailClient, adminOnly: true },
        { icon: Users,         label: 'Annuaire',       key: 'annuaire',   variant: 'bordeaux', onPress: handlers.onPressAnnuaire },
        { icon: MessageCircle, label: 'Messagerie',     key: 'messagerie', variant: 'bordeaux', onPress: handlers.onPressMessagerie,    badge: counts.messages, adminOnly: true },
      ],
    },
  ];

  const hasFooterActions =
    isAdmin && (
      handlers.onPressEdit !== undefined ||
      handlers.onPressCloturer !== undefined ||
      handlers.onPressSupprimer !== undefined
    );

  return (
    <View style={styles.container}>
      {groups.map((group) => {
        const gTiles = group.tiles
          .map(tile => ({ tile, mode: resolveMode(tile) }))
          .filter(x => x.mode !== 'hidden');
        if (gTiles.length === 0) return null;
        return (
          <View key={group.titre} style={styles.group}>
            <Text style={styles.groupTitle}>{group.titre}</Text>
            <View style={styles.grid}>
              {gTiles.map(({ tile, mode }, i) => (
                <View key={`${tile.label}-${i}`} style={styles.tileWrap}>
                  <SectionTile
                    icon={tile.icon}
                    label={tile.label}
                    variant={tile.variant}
                    onPress={tile.onPress}
                    badge={tile.badge}
                    readonly={mode === 'read'}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}

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
  container: {
    gap: 16,
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.marron,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8, // V10 Option A : gap réduit pour densité
  },
  tileWrap: {
    width: '31.8%',
  },
  footer: {
    gap: 8,
    marginTop: 4,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: DS.cremeNude,
  },
  footerBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: DS.errorSoft,
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.bordeaux,
  },
  footerBtnDangerText: {
    color: DS.error,
  },
});

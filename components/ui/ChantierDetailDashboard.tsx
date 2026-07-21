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
  onPressHonoraires: () => void;
  onPressPhases: () => void;
  onPressAdministratif: () => void;
  onPressConsultation: () => void;
  onPressAnnuaire: () => void;
  onPressJournal: () => void;
  onPressReserves: () => void;
  onPressSousTraitants: () => void;
  onPressAvenantPv: () => void;
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
}

interface TileSpec {
  icon: LucideIcon;
  label: string;
  variant: 'bordeaux' | 'marron';
  onPress: () => void;
  badge?: number;
  adminOnly?: boolean;
}

export function ChantierDetailDashboard({
  isAdmin,
  counts,
  handlers,
}: ChantierDetailDashboardProps) {
  // Tuiles regroupées par famille pour hiérarchiser (plutôt que 14 tuiles à plat).
  const groups: { titre: string; tiles: TileSpec[] }[] = [
    {
      titre: 'Conception',
      tiles: [
        { icon: Package, label: 'Prescriptions', variant: 'bordeaux', onPress: handlers.onPressPrescriptions },
        { icon: Wallet,  label: 'Budget',        variant: 'bordeaux', onPress: handlers.onPressBudget },
        { icon: Ruler,   label: 'Métrés',        variant: 'bordeaux', onPress: handlers.onPressMetres },
      ],
    },
    {
      titre: 'Suivi & terrain',
      tiles: [
        { icon: CheckSquare,   label: 'Notes',     variant: 'bordeaux', onPress: handlers.onPressNotes,  badge: counts.notes },
        { icon: Camera,        label: 'Photos',    variant: 'marron',   onPress: handlers.onPressPhotos, badge: counts.photos },
        { icon: ClipboardList, label: 'Suivis CR', variant: 'bordeaux', onPress: handlers.onPressSuivis, badge: counts.notesPlanning },
        { icon: CalendarRange, label: 'Phases',    variant: 'bordeaux', onPress: handlers.onPressPhases },
        { icon: History,       label: 'Journal',   variant: 'bordeaux', onPress: handlers.onPressJournal },
        { icon: Navigation,    label: 'Y aller',   variant: 'marron',   onPress: handlers.onPressYAller },
      ],
    },
    {
      titre: 'Finances',
      tiles: [
        { icon: Briefcase,    label: 'Marchés',     variant: 'bordeaux', onPress: handlers.onPressMarches,     badge: counts.marches, adminOnly: true },
        { icon: ShoppingCart, label: 'Achats',      variant: 'marron',   onPress: handlers.onPressAchats,      badge: counts.achats,  adminOnly: true },
        { icon: TrendingUp,   label: 'Rentabilité', variant: 'bordeaux', onPress: handlers.onPressRentabilite, adminOnly: true },
        { icon: HardHat,      label: 'Sous-traitants', variant: 'marron', onPress: handlers.onPressSousTraitants, adminOnly: true },
        { icon: Receipt,      label: 'Honoraires',  variant: 'bordeaux', onPress: handlers.onPressHonoraires,  adminOnly: true },
        { icon: Scale,        label: 'Consultation',variant: 'bordeaux', onPress: handlers.onPressConsultation, adminOnly: true },
      ],
    },
    {
      titre: 'Documents & réception',
      tiles: [
        { icon: FolderOpen, label: 'Documents',    variant: 'bordeaux', onPress: handlers.onPressDrive, adminOnly: true },
        { icon: Info,       label: 'Infos utiles', variant: 'bordeaux', onPress: handlers.onPressFiche },
        { icon: LayoutGrid, label: 'Plans',        variant: 'bordeaux', onPress: handlers.onPressPlans,     badge: counts.plans },
        { icon: FileCheck,  label: 'PV réception', variant: 'bordeaux', onPress: handlers.onPressPV,        adminOnly: true },
        { icon: FilePlus,   label: 'Avenant PV',   variant: 'bordeaux', onPress: handlers.onPressAvenantPv, adminOnly: true },
        { icon: Landmark,   label: 'Administratif',variant: 'bordeaux', onPress: handlers.onPressAdministratif, adminOnly: true },
        { icon: Flag,       label: 'Réserves',     variant: 'bordeaux', onPress: handlers.onPressReserves },
        { icon: Truck,      label: 'Livraison',    variant: 'marron',   onPress: handlers.onPressLivraison, badge: counts.livraisons },
      ],
    },
    {
      titre: 'Client & SAV',
      tiles: [
        { icon: Wrench,        label: 'SAV',            variant: 'bordeaux', onPress: handlers.onPressSAV,           badge: counts.sav, adminOnly: true },
        { icon: User,          label: 'Portail client', variant: 'marron',   onPress: handlers.onPressPortailClient, adminOnly: true },
        { icon: Users,         label: 'Annuaire',       variant: 'bordeaux', onPress: handlers.onPressAnnuaire },
        { icon: MessageCircle, label: 'Messagerie',     variant: 'bordeaux', onPress: handlers.onPressMessagerie,    badge: counts.messages, adminOnly: true },
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
        const gTiles = group.tiles.filter(t => !t.adminOnly || isAdmin);
        if (gTiles.length === 0) return null;
        return (
          <View key={group.titre} style={styles.group}>
            <Text style={styles.groupTitle}>{group.titre}</Text>
            <View style={styles.grid}>
              {gTiles.map((tile, i) => (
                <View key={`${tile.label}-${i}`} style={styles.tileWrap}>
                  <SectionTile
                    icon={tile.icon}
                    label={tile.label}
                    variant={tile.variant}
                    onPress={tile.onPress}
                    badge={tile.badge}
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

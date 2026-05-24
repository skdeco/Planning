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
  CheckCircle2,
  Trash2,
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
 * le parent.
 */
export interface ChantierDetailDashboardCounts {
  notes: number;
  plans: number;
  photos: number;
  achats: number;
  marches: number;
  notesPlanning: number;
  sav: number;
}

export interface ChantierDetailDashboardHandlers {
  onPressFiche: () => void;
  onPressPlans: () => void;
  onPressNotes: () => void;
  onPressSuivis: () => void;
  onPressPhotos: () => void;
  onPressYAller: () => void;
  onPressMarches: () => void;
  onPressSAV: () => void;
  onPressAchats: () => void;
  onPressPV: () => void;
  onPressRentabilite: () => void;
  onPressMessagerie: () => void;
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
  const tiles: TileSpec[] = [
    { icon: Info,           label: 'Infos utiles', variant: 'bordeaux', onPress: handlers.onPressFiche },
    { icon: LayoutGrid,     label: 'Plans',        variant: 'bordeaux', onPress: handlers.onPressPlans,       badge: counts.plans },
    { icon: CheckSquare,    label: 'Notes',        variant: 'bordeaux', onPress: handlers.onPressNotes,       badge: counts.notes },
    { icon: ClipboardList,  label: 'Suivis CR',    variant: 'bordeaux', onPress: handlers.onPressSuivis,      badge: counts.notesPlanning },
    { icon: Camera,         label: 'Photos',       variant: 'marron',   onPress: handlers.onPressPhotos,      badge: counts.photos },
    { icon: Navigation,     label: 'Y aller',      variant: 'marron',   onPress: handlers.onPressYAller },
    { icon: Briefcase,      label: 'Marchés',      variant: 'bordeaux', onPress: handlers.onPressMarches,     badge: counts.marches, adminOnly: true },
    { icon: Wrench,         label: 'SAV',          variant: 'bordeaux', onPress: handlers.onPressSAV,         badge: counts.sav,     adminOnly: true },
    { icon: ShoppingCart,   label: 'Achats',       variant: 'marron',   onPress: handlers.onPressAchats,      badge: counts.achats,  adminOnly: true },
    { icon: FileCheck,      label: 'PV réception', variant: 'bordeaux', onPress: handlers.onPressPV,          adminOnly: true },
    { icon: TrendingUp,     label: 'Rentabilité',  variant: 'bordeaux', onPress: handlers.onPressRentabilite, adminOnly: true },
    { icon: MessageCircle,  label: 'Messagerie',   variant: 'bordeaux', onPress: handlers.onPressMessagerie,  adminOnly: true },
  ];

  const visibleTiles = tiles.filter(t => !t.adminOnly || isAdmin);
  const hasFooterActions =
    isAdmin && (handlers.onPressCloturer !== undefined || handlers.onPressSupprimer !== undefined);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {visibleTiles.map((tile, i) => (
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

      {hasFooterActions && (
        <View style={styles.footer}>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tileWrap: {
    width: '31.5%',
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

/**
 * Bloc « Accès aux espaces » d'une fiche compte (employé, contact, sous-traitant).
 * Une case par espace + le rôle Menuiserie + la case Planning direction.
 */
import React from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { DS, radius } from '@/constants/design';
import type { AccesCompte, RoleMenuiserie } from '@/app/types';
import { ROLE_MENUISERIE_LABELS } from '@/app/types';

import { useLanguage } from '@/app/context/LanguageContext';
import { tm } from '@/lib/menuiserie/i18n';
interface Props {
  value: AccesCompte | undefined;
  onChange: (next: AccesCompte) => void;
  /** Libellé du rôle Travaux actuel du compte (ex. « Employé », « Commercial ») */
  roleTravauxLabel: string;
  /** Les admins ont toujours le Planning direction : la case est alors verrouillée */
  directionToujours?: boolean;
}

const ROLES: RoleMenuiserie[] = ['admin', 'usine', 'employe_usine', 'client', 'architecte', 'apporteur', 'poseur'];

function Ligne({ titre, sousTitre, valeur, onValeur, disabled }: {
  titre: string; sousTitre?: string; valeur: boolean; onValeur: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: DS.text }}>{titre}</Text>
        {!!sousTitre && <Text style={{ fontSize: 12, color: DS.textSecondary, marginTop: 2 }}>{sousTitre}</Text>}
      </View>
      <Switch
        value={valeur}
        onValueChange={onValeur}
        disabled={disabled}
        trackColor={{ false: DS.border, true: DS.primary }}
        thumbColor={DS.surface}
      />
    </View>
  );
}

export function AccesEspacesEditor({ value, onChange, roleTravauxLabel, directionToujours }: Props) {
  useLanguage(); // re-rendu au changement de langue
  const acces = value || {};
  const travaux = acces.travaux !== false;
  const menuiserie = acces.menuiserie;
  const set = (patch: Partial<AccesCompte>) => onChange({ ...acces, ...patch });

  return (
    <View style={{ marginTop: 18, padding: 12, backgroundColor: DS.background, borderRadius: radius.md, borderWidth: 1, borderColor: DS.border }}>
      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary, marginBottom: 4 }}>{tm("Accès aux espaces")}</Text>

      <Ligne
        titre={tm("Travaux")}
        sousTitre={travaux ? tm("Rôle : {0}", roleTravauxLabel) : tm("Pas d’accès à l’espace Travaux")}
        valeur={travaux}
        onValeur={v => set({ travaux: v })}
      />

      <Ligne
        titre={tm("Menuiserie")}
        sousTitre={menuiserie ? tm("Rôle : {0}", ROLE_MENUISERIE_LABELS[menuiserie]) : tm("Pas d’accès à l’espace Menuiserie")}
        valeur={!!menuiserie}
        onValeur={v => set({ menuiserie: v ? (menuiserie || 'admin') : undefined })}
      />
      {!!menuiserie && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {ROLES.map(r => {
            const on = r === menuiserie;
            return (
              <Pressable
                key={r}
                onPress={() => set({ menuiserie: r })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full,
                  backgroundColor: on ? DS.primary : DS.surface,
                  borderWidth: 1, borderColor: on ? DS.primary : DS.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? DS.textInverse : DS.text }}>
                  {ROLE_MENUISERIE_LABELS[r]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!!menuiserie && menuiserie !== 'admin' && (
        <Text style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 6 }}>{tm("Les espaces Usine, Client, Architecte, Apporteur et Poseur arrivent aux prochaines étapes.")}</Text>
      )}

      <Ligne
        titre={tm("Planning direction")}
        sousTitre={directionToujours ? tm("Toujours accessible pour un administrateur") : tm("Voit le planning direction et peut inviter à des RDV")}
        valeur={directionToujours ? true : !!acces.planningDirection}
        onValeur={v => set({ planningDirection: v })}
        disabled={directionToujours}
      />

      {!travaux && !menuiserie && (
        <Text style={{ fontSize: 12, color: DS.error, marginTop: 4 }}>{tm("Aucun espace coché : le compte ouvrira l’espace Travaux par défaut.")}</Text>
      )}
    </View>
  );
}

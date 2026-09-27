/**
 * Barre permanente en haut de l'app : Travaux | Menuiserie | Planning.
 * Visible dès qu'un compte a au moins deux destinations ; bascule instantanée,
 * sans nouvelle connexion. Sous la barre, les écrans ne rajoutent pas la marge
 * du haut de l'iPhone (la barre l'occupe déjà).
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/app/context/AppContext';
import { DS, radius } from '@/constants/design';
import { droitsEspaces, routeEspace } from '@/lib/espaces';
import { useInvitationsRdv } from '@/hooks/useInvitationsRdv';

export type OngletEspace = 'travaux' | 'menuiserie' | 'planning';

/** true = l'écran est affiché sous la barre d'espaces (la marge du haut est déjà prise). */
export const SousBarreEspaces = React.createContext(false);

function useOnglets(): OngletEspace[] {
  const { data, currentUser } = useApp();
  const d = droitsEspaces(currentUser, data);
  const o: OngletEspace[] = [];
  if (d.travaux) o.push('travaux');
  if (d.menuiserie) o.push('menuiserie');
  if (d.planningDirection) o.push('planning');
  return o;
}

const LIBELLE: Record<OngletEspace, string> = { travaux: 'Travaux', menuiserie: 'Menuiserie', planning: 'Planning' };

export function BarreEspaces({ actif }: { actif: OngletEspace }) {
  const { currentUser, setCurrentUser } = useApp();
  const router = useRouter();
  const { total } = useInvitationsRdv();
  const onglets = useOnglets();
  if (!currentUser || onglets.length < 2) return null;

  const aller = (o: OngletEspace) => {
    if (o === actif) return;
    if (o === 'planning') { router.navigate('/direction' as any); return; }
    setCurrentUser({ ...currentUser, espace: o });
    // navigate (et non replace) : l'espace déjà ouvert est réaffiché tel quel, sans rechargement
    router.navigate(routeEspace(o, currentUser) as any);
  };

  return (
    <View style={{ flexDirection: 'row', backgroundColor: DS.segment, borderRadius: radius.md, padding: 3, marginHorizontal: 12, marginTop: 4, marginBottom: 6 }}>
      {onglets.map(o => {
        const on = o === actif;
        return (
          <Pressable
            key={o}
            onPress={() => aller(o)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: on ? DS.primary : 'transparent' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: on ? DS.textInverse : DS.text }}>{LIBELLE[o]}</Text>
            {o === 'planning' && total > 0 && (
              <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: DS.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: DS.sombre }}>{total}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Enveloppe un espace : barre en haut + contenu sans double marge du haut. */
export function AvecBarreEspaces({ actif, children }: { actif: OngletEspace; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const onglets = useOnglets();
  if (onglets.length < 2) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: DS.background }}>
      <View style={{ paddingTop: insets.top, backgroundColor: DS.background }}>
        <BarreEspaces actif={actif} />
      </View>
      <SousBarreEspaces.Provider value={true}>
        <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
          <View style={{ flex: 1 }}>{children}</View>
        </SafeAreaInsetsContext.Provider>
      </SousBarreEspaces.Provider>
    </View>
  );
}

/** Écrans sans barre (connexion, choix de langue…) */
const SANS_BARRE = ['/login', '/language-select', '/espace', '/oauth'];

/**
 * Barre posée une seule fois à la racine de l'app : elle reste fixe pendant qu'on
 * change d'espace, seul le contenu en dessous change (comme un simple changement de page).
 */
export function BarreEspacesRacine({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const chemin = usePathname();
  // Les espaces restent montés en mémoire : on les reconstruit seulement quand la
  // personne connectée change (déconnexion / autre compte), jamais en changeant d'espace.
  const cleSession = currentUser
    ? `${currentUser.role}:${currentUser.employeId || currentUser.apporteurId || currentUser.soustraitantId || currentUser.nom || ''}`
    : 'aucun';
  const contenu = <React.Fragment key={cleSession}>{children}</React.Fragment>;
  // NB : « / » est aussi l'adresse de l'accueil Travaux → la barre doit y rester
  if (!currentUser || SANS_BARRE.some(p => chemin.startsWith(p))) return contenu;
  const actif: OngletEspace = chemin.startsWith('/menuiserie') ? 'menuiserie' : chemin.startsWith('/direction') ? 'planning' : 'travaux';
  return <AvecBarreEspaces actif={actif}>{contenu}</AvecBarreEspaces>;
}

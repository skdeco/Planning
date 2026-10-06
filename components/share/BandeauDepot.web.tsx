/**
 * Ordinateur : retour visuel du glisser-déposer de fichiers
 * (pendant le glissement, puis fichiers en attente d'une zone d'envoi).
 */
import React, { useEffect, useState } from 'react';
// @ts-expect-error types de react-dom non installés (web uniquement)
import { createPortal } from 'react-dom';
import { View, Text, Pressable, Platform } from 'react-native';
import { annulerDepot, installerDepotFichiers, suivreDepot } from '@/lib/share/depotFichiers';
import { tm } from '@/lib/menuiserie/i18n';

export function BandeauDepot() {
  const [e, setE] = useState({ glisse: false, enAttente: 0, noms: [] as string[] });
  useEffect(() => { installerDepotFichiers(); return suivreDepot(setE); }, []);
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  // Au-dessus de tout, y compris des fenêtres (modales) ouvertes
  const auDessus = (enfant: React.ReactNode) => createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2147483000, pointerEvents: 'none', display: 'flex' }}>{enfant}</div>,
    document.body,
  );
  if (e.glisse) {
    return auDessus(
      <View pointerEvents="none" style={{ flex: 1, backgroundColor: 'rgba(20,20,20,0.08)', borderWidth: 3, borderStyle: 'dashed', borderColor: '#141414', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 24 }}>
        <View style={{ backgroundColor: '#141414', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>{tm("Lâchez les fichiers près de l'endroit où les ajouter")}</Text>
        </View>
      </View>
    );
  }
  if (!e.enAttente) return null;
  return auDessus(
    <View style={{ position: 'absolute', left: 16, right: 16, bottom: 24, alignItems: 'center' }} pointerEvents="box-none">
      <View style={{ maxWidth: 560, width: '100%', pointerEvents: 'auto' as never, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#141414', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' }} numberOfLines={2}>
          📎 {e.enAttente > 1 ? tm("{0} fichiers prêts", e.enAttente) : e.noms[0]} — {tm("cliquez sur le bouton d'ajout voulu")}
        </Text>
        <Pressable onPress={annulerDepot} accessibilityRole="button" hitSlop={8}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' }}>{tm("Annuler")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

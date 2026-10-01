/**
 * Onglet Photos (employé) :
 *  - en haut, l'envoi : choix du chantier (celui du jour en premier) puis « Ajouter des photos » ;
 *  - en dessous, ses chantiers avec leurs dernières photos ; un appui ouvre la galerie du chantier.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, useWindowDimensions, RefreshControl } from 'react-native';
import { Camera } from 'lucide-react-native';
import { ScreenContainer } from '@/components/screen-container';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { useApp } from '@/app/context/AppContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { useRefresh } from '@/hooks/useRefresh';
import { useEnvoiPhotos } from '@/hooks/useEnvoiPhotos';
import { DS, radius } from '@/constants/design';
import { screenTitle } from '@/constants/design';
import { todayYMD } from '@/lib/date/today';
import { tm } from '@/lib/menuiserie/i18n';

export default function PhotosScreen() {
  useLanguage();
  const { data, currentUser } = useApp();
  const { refreshing, onRefresh } = useRefresh();
  const { width } = useWindowDimensions();
  const { envoi, ajouter } = useEnvoiPhotos();
  const moi = currentUser?.employeId || '';
  const isAdmin = currentUser?.role === 'admin';
  const jour = todayYMD();
  const [galerie, setGalerie] = useState<string | null>(null);

  // Mes chantiers : ceux du jour d'abord (pointage puis planning), puis ceux où j'ai été affecté, du plus récent au plus ancien
  const chantiers = useMemo(() => {
    const ids: string[] = [];
    const ajout = (id?: string) => { if (id && !ids.includes(id)) ids.push(id); };
    data.pointages.filter(p => p.employeId === moi && p.date === jour).sort((a, b) => b.heure.localeCompare(a.heure)).forEach(p => ajout(p.chantierId));
    data.affectations.filter(a => a.employeId === moi && a.dateDebut <= jour && a.dateFin >= jour).forEach(a => ajout(a.chantierId));
    [...data.affectations].filter(a => isAdmin || a.employeId === moi).sort((a, b) => b.dateFin.localeCompare(a.dateFin)).forEach(a => ajout(a.chantierId));
    if (isAdmin) data.chantiers.filter(c => c.statut === 'actif').forEach(c => ajout(c.id));
    return ids.map(id => data.chantiers.find(c => c.id === id)).filter(c => !!c && c.statut !== 'archive') as typeof data.chantiers;
  }, [data.pointages, data.affectations, data.chantiers, moi, jour, isAdmin]);

  const duJour = new Set([
    ...data.pointages.filter(p => p.employeId === moi && p.date === jour).map(p => p.chantierId),
    ...data.affectations.filter(a => a.employeId === moi && a.dateDebut <= jour && a.dateFin >= jour).map(a => a.chantierId),
  ]);
  const [choisi, setChoisi] = useState<string | null>(null);
  const cible = chantiers.find(c => c.id === choisi) || chantiers[0];
  const vignette = Math.floor((width - 32 - 24 - 18) / 4);

  return (
    <ScreenContainer containerClassName="bg-[#FAF5EF]" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={screenTitle}>{tm('Photos')}</Text>

        {/* Envoi */}
        {chantiers.length > 0 ? (
          <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 12, gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary }}>{tm('Ajouter sur le chantier')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {chantiers.map(c => {
                const on = c.id === cible?.id;
                return (
                  <Pressable key={c.id} onPress={() => setChoisi(c.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: radius.full, justifyContent: 'center', backgroundColor: on ? (c.couleur || DS.primary) : DS.surfaceAlt }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : DS.text }}>{duJour.has(c.id) ? '● ' : ''}{c.nom}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => cible && ajouter(cible.id)} disabled={!!envoi} accessibilityRole="button"
              style={{ minHeight: 56, borderRadius: radius.md, backgroundColor: DS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: envoi ? 0.8 : 1 }}>
              <Camera size={22} color="#fff" strokeWidth={2} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                {envoi ? tm('Envoi {0}/{1}…', envoi.fait, envoi.total) : tm('Ajouter des photos')}
              </Text>
            </Pressable>
            {!!cible && <Text style={{ fontSize: 12, color: DS.textSecondary, textAlign: 'center' }}>{tm('Appareil photo ou photothèque · {0}', cible.nom)}</Text>}
          </View>
        ) : (
          <Text style={{ fontSize: 14, color: DS.textSecondary }}>{tm('Aucun chantier pour le moment.')}</Text>
        )}

        {/* Mes photos par chantier */}
        {chantiers.map(c => {
          const photos = (data.photosChantier || []).filter(p => p.chantierId === c.id)
            .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
          return (
            <Pressable key={c.id} onPress={() => setGalerie(c.id)} accessibilityRole="button"
              style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: c.couleur || DS.primary }} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: DS.text }} numberOfLines={1}>{c.nom}</Text>
                <Text style={{ fontSize: 13, color: DS.textSecondary }}>{tm('{0} photo(s)', photos.length)}  ›</Text>
              </View>
              {photos.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {photos.slice(0, 4).map(p => (
                    <Image key={p.id} source={{ uri: p.uri }} style={{ width: vignette, height: vignette, borderRadius: 8, backgroundColor: DS.surfaceAlt }} resizeMode="cover" />
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: DS.textMuted }}>{tm('Pas encore de photo')}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <GaleriePhotos visible={!!galerie} onClose={() => setGalerie(null)} chantierId={galerie || undefined} />
    </ScreenContainer>
  );
}

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { close, type InitialProps } from 'expo-share-extension';

import { DS, font, radius, space } from '@/constants/design';
import { loadChantiersCache, type LoadResult } from '@/lib/share/chantiersCache';

function formatAge(ms?: number): string {
  if (ms === undefined) return '?';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} j`;
}

/**
 * Composant racine de la Share Extension iOS.
 * Affiché dans le Share Sheet quand l'utilisateur partage un fichier
 * vers SK Deco depuis Mail, Photos, Files, etc.
 *
 * **J1 hello world** : affiche les infos du fichier reçu (chemin,
 * type, etc.) et un bouton Fermer.
 *
 * **J2** : remplacer par un ShareIntakeModal complet (sélecteur
 * chantier + destination : note / plan / galerie / SAV + champs
 * spécifiques).
 *
 * **J3** : `processIncomingFile` (upload Supabase + insertion DB
 * selon la destination choisie).
 *
 * Vit à la racine du projet (référencé par `index.share.js`).
 * Ne PAS placer dans `app/` — `app/` est géré par expo-router et la
 * share extension a son propre bundle.
 */
export default function ShareExtension(props: InitialProps): React.ReactElement {
  const { files, images, videos, text, url } = props;
  const [cacheResult, setCacheResult] = useState<LoadResult | null>(null);

  // Lit le cache chantiers écrit par l'app principale (via
  // useChantiersCacheSync) pour alimenter l'UI compteur ci-dessous.
  // Sera utilisé en J2.B comme source du sélecteur de chantier.
  useEffect(() => {
    setCacheResult(loadChantiersCache());
  }, []);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#FAFAF9' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#11181C' }}>
        📎 Share reçu (J1 hello world)
      </Text>

      {cacheResult !== null && (
        <View
          style={{
            padding: space.md,
            backgroundColor: DS.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: DS.border,
            marginBottom: space.md,
          }}
        >
          <Text style={{ color: DS.text, fontSize: font.md, fontWeight: '600' }}>
            📋 {cacheResult.chantiers.length} chantiers chargés
          </Text>
          <Text
            style={{
              color: DS.textSecondary,
              fontSize: font.compact,
              marginTop: 2,
            }}
          >
            {cacheResult.status === 'missing'
              ? `Cache absent${cacheResult.error ? ` (${cacheResult.error})` : ''}`
              : cacheResult.status === 'stale'
                ? `Cache périmé (${formatAge(cacheResult.ageMs)})`
                : `Frais (${formatAge(cacheResult.ageMs)})`}
          </Text>
        </View>
      )}

      {files !== undefined && files.length > 0 && (
        <Text style={{ marginBottom: 8, color: '#11181C' }}>
          Files ({files.length}) :{'\n'}{files.join('\n')}
        </Text>
      )}
      {images !== undefined && images.length > 0 && (
        <Text style={{ marginBottom: 8, color: '#11181C' }}>
          Images ({images.length}) :{'\n'}{images.join('\n')}
        </Text>
      )}
      {videos !== undefined && videos.length > 0 && (
        <Text style={{ marginBottom: 8, color: '#11181C' }}>
          Videos ({videos.length}) :{'\n'}{videos.join('\n')}
        </Text>
      )}
      {text !== undefined && (
        <Text style={{ marginBottom: 8, color: '#11181C' }}>Text : {text}</Text>
      )}
      {url !== undefined && (
        <Text style={{ marginBottom: 8, color: '#11181C' }}>URL : {url}</Text>
      )}

      <Text
        onPress={() => close()}
        style={{
          marginTop: 24,
          padding: 12,
          backgroundColor: '#11181C',
          color: '#fff',
          textAlign: 'center',
          borderRadius: 8,
          overflow: 'hidden',
          fontWeight: '600',
        }}
      >
        Fermer
      </Text>
    </View>
  );
}

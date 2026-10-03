/**
 * Dessiner sur une photo (comptes rendus) : traits à main levée en couleur,
 * annuler, effacer, puis « Valider » produit une NOUVELLE image (photo + dessin
 * fusionnés) prête à être envoyée. Aucune dépendance native supplémentaire :
 * la fusion passe par react-native-svg (toDataURL).
 *
 * Usage : envelopper l'écran avec <AnnotationProvider>, puis
 *   const annoter = useAnnoterPhoto();  const uri2 = await annoter(uri);
 * `annoter` rend l'URI d'origine si l'utilisateur passe sans dessiner.
 * Le panneau s'affiche en surimpression DANS l'écran courant (pas de Modal
 * empilée, fiable sur iOS).
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, Image as RNImage, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Path, Image as SvgImage } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tm } from '@/lib/menuiserie/i18n';

type Annoter = (uri: string) => Promise<string>;
const Ctx = createContext<Annoter | null>(null);

/** Renvoie la fonction d'annotation (ou l'identité si aucun fournisseur / sur le web). */
export function useAnnoterPhoto(): Annoter {
  const f = useContext(Ctx);
  return f || (async (u: string) => u);
}

const COULEURS = ['#E53935', '#FBC02D', '#1E88E5', '#141414', '#FFFFFF'];
const EPAISSEURS = [4, 8];
type Trait = { d: string; couleur: string; largeur: number };

export function AnnotationProvider({ children }: { children: React.ReactNode }) {
  const [enCours, setEnCours] = useState<{ uri: string; resoudre: (u: string) => void } | null>(null);
  const annoter = useCallback<Annoter>((uri) => {
    if (Platform.OS === 'web') return Promise.resolve(uri);
    return new Promise(resoudre => setEnCours({ uri, resoudre }));
  }, []);
  return (
    <Ctx.Provider value={annoter}>
      <View style={{ flex: 1 }}>
        {children}
        {enCours && (
          <EditeurDessin
            uri={enCours.uri}
            onFin={u => { enCours.resoudre(u); setEnCours(null); }}
          />
        )}
      </View>
    </Ctx.Provider>
  );
}

function EditeurDessin({ uri, onFin }: { uri: string; onFin: (u: string) => void }) {
  const insets = useSafeAreaInsets();
  const [zone, setZone] = useState<{ w: number; h: number } | null>(null);
  const [taille, setTaille] = useState<{ w: number; h: number } | null>(null);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [courant, setCourant] = useState<string>('');
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [largeur, setLargeur] = useState(EPAISSEURS[0]);
  const [export_, setExport] = useState(false);
  const svgRef = useRef<any>(null);
  const courantRef = useRef('');
  const reglages = useRef({ couleur, largeur });
  reglages.current = { couleur, largeur };

  React.useEffect(() => {
    RNImage.getSize(uri, (w, h) => setTaille({ w, h }), () => setTaille({ w: 3, h: 4 }));
  }, [uri]);

  // Rectangle d'affichage de la photo (contenue dans la zone)
  const rect = useMemo(() => {
    if (!zone || !taille) return null;
    const r = Math.min(zone.w / taille.w, zone.h / taille.h);
    return { w: Math.round(taille.w * r), h: Math.round(taille.h * r) };
  }, [zone, taille]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      courantRef.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
      setCourant(courantRef.current);
    },
    onPanResponderMove: e => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      courantRef.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
      setCourant(courantRef.current);
    },
    onPanResponderRelease: () => {
      const d = courantRef.current;
      if (d) setTraits(t => [...t, { d, couleur: reglages.current.couleur, largeur: reglages.current.largeur }]);
      courantRef.current = '';
      setCourant('');
    },
  }), []);

  const valider = () => {
    if (traits.length === 0 || !rect || !taille || !svgRef.current) { onFin(uri); return; }
    setExport(true);
    // Résolution de sortie : celle de la photo, plafonnée à 2000 px de large
    const echelle = Math.min(2000, taille.w) / rect.w;
    svgRef.current.toDataURL(async (b64: string) => {
      try {
        const fichier = `${FileSystem.cacheDirectory}annot_${Date.now()}.png`;
        await FileSystem.writeAsStringAsync(fichier, b64, { encoding: FileSystem.EncodingType.Base64 });
        const jpg = await ImageManipulator.manipulateAsync(fichier, [], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG });
        onFin(jpg.uri);
      } catch {
        onFin(uri);
      }
    }, { width: Math.round(rect.w * echelle), height: Math.round(rect.h * echelle) });
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0E0E0E', zIndex: 2000, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, marginBottom: 8 }}>
        <Pressable onPress={() => onFin(uri)} hitSlop={8} style={st.btnGhost}><Text style={st.txtGhost}>{tm('Sans dessin')}</Text></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setTraits(t => t.slice(0, -1))} disabled={!traits.length} hitSlop={8} style={[st.btnGhost, !traits.length && { opacity: 0.4 }]}><Text style={st.txtGhost}>{tm('Annuler')}</Text></Pressable>
        <Pressable onPress={valider} disabled={export_} style={st.btnPlein}>
          {export_ ? <ActivityIndicator color="#141414" /> : <Text style={st.txtPlein}>{tm('Valider')}</Text>}
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onLayout={e => setZone({ w: e.nativeEvent.layout.width - 16, h: e.nativeEvent.layout.height - 16 })}>
        {rect ? (
          <View style={{ width: rect.w, height: rect.h }} {...pan.panHandlers}>
            <Svg ref={svgRef} width={rect.w} height={rect.h} viewBox={`0 0 ${rect.w} ${rect.h}`}>
              <SvgImage href={{ uri }} x={0} y={0} width={rect.w} height={rect.h} preserveAspectRatio="none" />
              {traits.map((t, i) => (
                <Path key={i} d={t.d} stroke={t.couleur} strokeWidth={t.largeur} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {!!courant && <Path d={courant} stroke={couleur} strokeWidth={largeur} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            </Svg>
          </View>
        ) : <ActivityIndicator color="#fff" />}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 }}>
        {COULEURS.map(c => (
          <Pressable key={c} onPress={() => setCouleur(c)} accessibilityLabel={c}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: couleur === c ? 3 : 1, borderColor: couleur === c ? '#FFFFFF' : 'rgba(255,255,255,0.35)' }} />
        ))}
        <View style={{ width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.25)' }} />
        {EPAISSEURS.map(e => (
          <Pressable key={e} onPress={() => setLargeur(e)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: largeur === e ? 'rgba(255,255,255,0.18)' : 'transparent' }}>
            <View style={{ width: e + 4, height: e + 4, borderRadius: 20, backgroundColor: '#FFFFFF' }} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  btnGhost: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center' },
  txtGhost: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  btnPlein: { height: 38, minWidth: 90, paddingHorizontal: 16, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  txtPlein: { color: '#141414', fontSize: 14, fontWeight: '800' },
});

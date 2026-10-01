/**
 * Accueil employé : accès direct aux photos du chantier du jour.
 *  - « Ajouter des photos » : appareil photo ou photothèque, envoi en arrière-plan
 *    (3 photos à la fois, compressées), avec la progression.
 *  - « Voir les photos » : galerie du chantier.
 * Chantier du jour = celui du dernier pointage, sinon celui du planning (choix si plusieurs).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Camera, Images } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useApp } from '@/app/context/AppContext';
import type { PhotoChantier } from '@/app/types';
import { DS, radius } from '@/constants/design';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { todayYMD } from '@/lib/date/today';
import { tm } from '@/lib/menuiserie/i18n';

export function PhotosRapides({ onVoir }: { onVoir: (chantierId: string) => void }) {
  const { data, currentUser, addPhotosChantier } = useApp();
  const moi = currentUser?.employeId || '';
  const jour = todayYMD();

  // Chantiers proposés : pointage du jour, puis affectations du jour
  const candidats = useMemo(() => {
    const ids: string[] = [];
    const pts = data.pointages.filter(p => p.employeId === moi && p.date === jour && p.chantierId).sort((a, b) => b.heure.localeCompare(a.heure));
    pts.forEach(p => { if (p.chantierId && !ids.includes(p.chantierId)) ids.push(p.chantierId); });
    data.affectations.filter(a => a.employeId === moi && a.dateDebut <= jour && a.dateFin >= jour)
      .forEach(a => { if (!ids.includes(a.chantierId)) ids.push(a.chantierId); });
    return ids.map(id => data.chantiers.find(c => c.id === id)).filter(Boolean) as { id: string; nom: string; couleur?: string }[];
  }, [data.pointages, data.affectations, data.chantiers, moi, jour]);

  const [choisi, setChoisi] = useState<string | null>(null);
  const chantier = candidats.find(c => c.id === choisi) || candidats[0];
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);

  if (!candidats.length) return null;

  const ajouter = async () => {
    if (!chantier || envoi) return;
    const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, acceptPdf: false, multiple: true, compressImages: true });
    if (!files.length) return;
    const total = files.length;
    let fait = 0;
    setEnvoi({ fait, total });
    const ajoutees: PhotoChantier[] = [];
    const file = [...files];
    // 3 envois en parallèle
    await Promise.all(Array.from({ length: Math.min(3, total) }, async () => {
      while (file.length) {
        const f = file.shift(); if (!f) break;
        const id = `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const url = await uploadFileToStorage(f.uri, `chantiers/${chantier.id}/photos`, id);
        if (url) ajoutees.push({ id, chantierId: chantier.id, employeId: moi, date: jour, uri: url, nom: f.filename, createdAt: new Date().toISOString(), source: 'manuel' });
        fait++; setEnvoi({ fait, total });
      }
    }));
    if (ajoutees.length) addPhotosChantier(ajoutees);
    setEnvoi(null);
    if (ajoutees.length === total) toast.success(tm('{0} photo(s) envoyée(s) — {1}', total, chantier.nom));
    else toast.error(tm("{0} photo(s) n'ont pas pu être envoyées", total - ajoutees.length));
  };

  const nbPhotos = chantier ? (data.photosChantier || []).filter(p => p.chantierId === chantier.id).length : 0;

  return (
    <View style={{ backgroundColor: DS.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: DS.border, padding: 12, gap: 10, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.textSecondary }}>{tm('Photos du chantier')}</Text>
      </View>
      {candidats.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {candidats.map(c => {
            const on = c.id === chantier?.id;
            return (
              <Pressable key={c.id} onPress={() => setChoisi(c.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: radius.full, justifyContent: 'center', backgroundColor: on ? (c.couleur || DS.primary) : DS.surfaceAlt }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : DS.text }}>{c.nom}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={ajouter} disabled={!!envoi} accessibilityRole="button"
          style={{ flex: 1.4, minHeight: 52, borderRadius: radius.md, backgroundColor: DS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: envoi ? 0.8 : 1 }}>
          <Camera size={20} color="#fff" strokeWidth={2} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }} numberOfLines={1}>
            {envoi ? tm('Envoi {0}/{1}…', envoi.fait, envoi.total) : tm('Ajouter des photos')}
          </Text>
        </Pressable>
        <Pressable onPress={() => chantier && onVoir(chantier.id)} accessibilityRole="button"
          style={{ flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: DS.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Images size={18} color={DS.primary} strokeWidth={2} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: DS.primary }} numberOfLines={1}>{tm('Voir ({0})', nbPhotos)}</Text>
        </Pressable>
      </View>
      {candidats.length === 1 && <Text style={{ fontSize: 12, color: DS.textSecondary }}>{chantier?.nom}</Text>}
    </View>
  );
}

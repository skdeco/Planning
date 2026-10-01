/**
 * Envoi de photos de chantier : appareil photo ou photothèque, compression,
 * 3 envois en parallèle, progression et ajout à la galerie du chantier.
 */
import { useState } from 'react';
import { toast } from 'sonner-native';
import { useApp } from '@/app/context/AppContext';
import type { PhotoChantier } from '@/app/types';
import { uploadFileToStorage } from '@/lib/supabase';
import { pickNativeFile } from '@/lib/share/pickNativeFile';
import { todayYMD } from '@/lib/date/today';
import { tm } from '@/lib/menuiserie/i18n';

export function useEnvoiPhotos() {
  const { data, currentUser, addPhotosChantier } = useApp();
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);

  const ajouter = async (chantierId: string) => {
    if (envoi) return;
    const files = await pickNativeFile({ acceptImages: true, acceptCamera: true, acceptPdf: false, multiple: true, compressImages: true });
    if (!files.length) return;
    const total = files.length;
    let fait = 0;
    setEnvoi({ fait, total });
    const ajoutees: PhotoChantier[] = [];
    const file = [...files];
    const moi = currentUser?.employeId || 'admin';
    await Promise.all(Array.from({ length: Math.min(3, total) }, async () => {
      while (file.length) {
        const f = file.shift(); if (!f) break;
        const id = `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const url = await uploadFileToStorage(f.uri, `chantiers/${chantierId}/photos`, id);
        if (url) ajoutees.push({ id, chantierId, employeId: moi, date: todayYMD(), uri: url, nom: f.filename, createdAt: new Date().toISOString(), source: 'manuel' });
        fait++; setEnvoi({ fait, total });
      }
    }));
    if (ajoutees.length) addPhotosChantier(ajoutees);
    setEnvoi(null);
    const nom = data.chantiers.find(c => c.id === chantierId)?.nom || '';
    if (ajoutees.length === total) toast.success(tm('{0} photo(s) envoyée(s) — {1}', total, nom));
    else toast.error(tm("{0} photo(s) n'ont pas pu être envoyées", total - ajoutees.length));
  };

  return { envoi, ajouter };
}

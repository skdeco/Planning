/**
 * Carte "Sauvegarde des données" (admin).
 *
 * - Exporter : génère un fichier JSON complet (toutes les données + URL des
 *   photos) et ouvre le partage natif. Sauvegarde récupérable.
 * - Restaurer : importe un fichier JSON de sauvegarde et remplace l'intégralité
 *   des données (avec confirmation).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { toast } from 'sonner-native';
import { DatabaseBackup, Upload, Download } from 'lucide-react-native';
import { useApp } from '@/app/context/AppContext';
import { useConfirm } from '@/hooks/useConfirm';
import { exportDataBackup, parseBackup, summarizeBackup } from '@/lib/backup/dataBackup';
import { DS, radius, space, font } from '@/constants/design';

export function DataBackupCard() {
  const { data, importAllData } = useApp();
  const { confirm, ConfirmModal } = useConfirm();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const handleExport = async () => {
    setBusy('export');
    try {
      const res = await exportDataBackup(data);
      if (res.ok) toast.success('Sauvegarde exportée');
      else toast.error(res.error || "Échec de l'export");
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const uri = picked.assets[0].uri;

      let text: string;
      if (Platform.OS === 'web') {
        text = await (await fetch(uri)).text();
      } else {
        text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      }

      const parsed = parseBackup(text);
      if (!parsed) {
        toast.error('Fichier de sauvegarde invalide');
        return;
      }

      const ok = await confirm(
        `Restaurer cette sauvegarde ?\n\n${summarizeBackup(parsed)}\n\nToutes les données actuelles seront remplacées.`,
      );
      if (!ok) return;

      setBusy('import');
      importAllData(parsed);
      toast.success('Sauvegarde restaurée');
    } catch {
      toast.error('Échec de la restauration');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <DatabaseBackup size={18} color={DS.bordeaux} />
        <Text style={styles.title}>Sauvegarde des données</Text>
      </View>
      <Text style={styles.desc}>
        Exportez un fichier de sauvegarde complet (données + photos liées au cloud)
        ou restaurez une sauvegarde existante.
      </Text>

      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleExport} disabled={busy !== null}>
          {busy === 'export'
            ? <ActivityIndicator size="small" color={DS.surface} />
            : <Download size={16} color={DS.surface} />}
          <Text style={styles.btnPrimaryTxt}>Exporter</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={handleImport} disabled={busy !== null}>
          {busy === 'import'
            ? <ActivityIndicator size="small" color={DS.bordeaux} />
            : <Upload size={16} color={DS.bordeaux} />}
          <Text style={styles.btnSecondaryTxt}>Restaurer</Text>
        </Pressable>
      </View>

      <ConfirmModal />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: DS.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: DS.border,
    padding: space.lg,
    marginBottom: space.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 6 },
  title: { fontSize: font.lg, fontWeight: font.bold, color: DS.textStrong },
  desc: { fontSize: font.sm, color: DS.textAlt, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.md },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  btnPrimary: { backgroundColor: DS.bordeaux },
  btnPrimaryTxt: { fontSize: font.md, fontWeight: font.bold, color: DS.surface },
  btnSecondary: { backgroundColor: DS.cremeNude },
  btnSecondaryTxt: { fontSize: font.md, fontWeight: font.bold, color: DS.bordeaux },
});

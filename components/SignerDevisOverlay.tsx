import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SignaturePad } from '@/components/SignaturePad';
import { DS } from '@/constants/design';
import {
  apposerEncadreSignature,
  fetchPdfBytes,
  bytesToBase64,
} from '@/lib/pdfSigner';
import { uploadFileToStorage } from '@/lib/supabase';

/**
 * SignerDevisOverlay — Overlay (inline absolute, PAS un Modal RN) pour
 * apposer la signature client + date + mention sur le PDF d'un devis.
 *
 * Le parent rend cet overlay au niveau racine de son Modal (style
 * `position: absolute zIndex: 1000`) — évite le bug iOS Modal-on-Modal.
 */
export interface SignerDevisOverlayProps {
  visible: boolean;
  onClose: () => void;
  /** URL du PDF original (devis non signé). */
  devisUri: string;
  /** Nom du fichier original (utilisé pour générer le nom du signé). */
  devisNom?: string;
  /** ID chantier pour le path Storage. */
  chantierId: string;
  /** Type pour le folder Storage (marche/supplement). */
  type: 'marche' | 'supplement';
  /** Callback après upload réussi du PDF signé. */
  onSigned: (uri: string, nom: string) => void;
}

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const MENTION_DEFAULT = "Reçu avant l'exécution des travaux, bon pour accord";

export function SignerDevisOverlay({
  visible,
  onClose,
  devisUri,
  devisNom,
  chantierId,
  type,
  onSigned,
}: SignerDevisOverlayProps) {
  const [signature, setSignature] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);
  const [date, setDate] = useState(todayDDMMYYYY());
  const [mention, setMention] = useState(MENTION_DEFAULT);
  const [busy, setBusy] = useState(false);

  // Reset à chaque ouverture
  React.useEffect(() => {
    if (visible) {
      setSignature(null);
      setShowPad(false);
      setDate(todayDDMMYYYY());
      setMention(MENTION_DEFAULT);
      setBusy(false);
    }
  }, [visible]);

  const handleApposer = async () => {
    if (!signature) {
      const msg = 'Veuillez signer avant de continuer.';
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Signature manquante', msg);
      return;
    }
    if (!mention.trim() || !date.trim()) {
      const msg = 'Mention et date sont obligatoires.';
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Champs manquants', msg);
      return;
    }
    setBusy(true);
    try {
      // 1. Télécharger le PDF original
      const pdfBytes = await fetchPdfBytes(devisUri);
      // 2. Dessiner l'encadré "Bon pour accord" en bas de la dernière
      //    page (fond blanc opaque qui masque tout contenu existant
      //    en dessous)
      const signedBytes = await apposerEncadreSignature({
        pdfBytes,
        signatureBase64: signature,
        mention: mention.trim(),
        date: date.trim(),
      });
      // 3. Convertir bytes → data URI pour réutiliser uploadFileToStorage
      const base64 = bytesToBase64(signedBytes);
      const dataUri = `data:application/pdf;base64,${base64}`;
      // 4. Upload Supabase
      const fileId = `signe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const folder = type === 'marche'
        ? `chantiers/${chantierId}/marche/devis-signe`
        : `chantiers/${chantierId}/supplements/devis-signe`;
      const url = await uploadFileToStorage(dataUri, folder, fileId);
      if (!url) {
        throw new Error('Upload Supabase échoué');
      }
      const nom = (devisNom || 'devis').replace(/\.pdf$/i, '') + '-signe.pdf';
      onSigned(url, nom);
      onClose();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const msg = `Erreur lors de la signature du PDF : ${errMsg}`;
      if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(msg); }
      else Alert.alert('Erreur', msg);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>✍️ Signer le devis</Text>
          <Text style={styles.subtitle}>
            Remplis le cadre "Pour le client" en bas de la dernière page du devis.
          </Text>

          {/* Mention */}
          <Text style={styles.fieldLabel}>Mention manuscrite</Text>
          <TextInput
            style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            value={mention}
            onChangeText={setMention}
            multiline
          />

          {/* Date */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Date (JJ/MM/AAAA)</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="13/05/2026"
            placeholderTextColor={DS.textSecondary}
            keyboardType="numbers-and-punctuation"
          />

          {/* Signature */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Signature</Text>
          {signature ? (
            <View style={styles.signaturePreview}>
              <View style={styles.signaturePreviewBox}>
                <Image
                  source={{ uri: signature }}
                  style={{ width: 240, height: 80, resizeMode: 'contain' }}
                />
              </View>
              <Pressable style={styles.resignBtn} onPress={() => { setSignature(null); setShowPad(true); }}>
                <Text style={styles.resignBtnText}>Re-signer</Text>
              </Pressable>
            </View>
          ) : showPad ? (
            <View style={styles.padWrap}>
              <SignaturePad
                width={280}
                height={140}
                onCancel={() => setShowPad(false)}
                onSave={(base64) => {
                  setSignature(base64);
                  setShowPad(false);
                }}
              />
            </View>
          ) : (
            <Pressable style={styles.signBtn} onPress={() => setShowPad(true)}>
              <Text style={styles.signBtnText}>✍️ Signer maintenant</Text>
            </Pressable>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={busy ? undefined : onClose}
              style={[styles.cancelBtn, busy && { opacity: 0.5 }]}
              disabled={busy}
            >
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleApposer}
              disabled={!signature || busy}
              style={[styles.saveBtn, (!signature || busy) && { opacity: 0.5 }]}
            >
              {busy ? (
                <ActivityIndicator color={DS.cremeFond} />
              ) : (
                <Text style={styles.saveBtnText}>Apposer sur PDF</Text>
              )}
            </Pressable>
          </View>

          {busy && (
            <Text style={styles.busyHint}>
              Téléchargement, signature et upload en cours…
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: DS.surface,
    borderRadius: 16,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: DS.sombre,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: DS.textSecondary,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.textSecondary,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    backgroundColor: DS.cremeFond,
    borderWidth: 1,
    borderColor: DS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: DS.sombre,
  },
  signBtn: {
    backgroundColor: DS.bordeaux,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  signBtnText: {
    color: DS.cremeFond,
    fontSize: 13,
    fontWeight: '700',
  },
  padWrap: {
    backgroundColor: DS.cremeNude,
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  signaturePreview: {
    alignItems: 'center',
    gap: 8,
  },
  signaturePreviewBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DS.border,
    padding: 6,
  },
  resignBtn: {
    backgroundColor: DS.cremeNude,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resignBtnText: {
    color: DS.bordeaux,
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: DS.cremeNude,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: DS.sombre,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: DS.bordeaux,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: DS.cremeFond,
    fontWeight: '700',
  },
  busyHint: {
    fontSize: 11,
    color: DS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
});

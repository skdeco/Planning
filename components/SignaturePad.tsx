import React, { useRef } from 'react';
import { View, Pressable, Text, Platform } from 'react-native';
import SignatureView, { SignatureViewRef } from 'react-native-signature-canvas';

interface SignaturePadProps {
  /** Largeur du canvas. Default: 300. */
  width?: number;
  /** Hauteur du canvas. Default: 150. */
  height?: number;
  onCancel: () => void;
  onSave: (base64: string) => void;
}

export function SignaturePad({ width = 300, height = 150, onCancel, onSave }: SignaturePadProps) {
  const ref = useRef<SignatureViewRef>(null);

  // Web fallback : pas de WebView dispo en RN web, signature désactivée
  if (Platform.OS === 'web') {
    return (
      <View style={{ alignItems: 'center', padding: 16, width, minHeight: height + 80 }}>
        <View style={{
          width, height,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: '#C9A96E',
          borderStyle: 'dashed',
          backgroundColor: '#F5EDE3',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 12, color: '#8C6D2F', fontWeight: '600' }}>Signature uniquement disponible sur mobile
          </Text>
        </View>
        <Pressable
          onPress={onCancel}
          style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#F5EDE3', borderRadius: 8 }}
        >
          <Text style={{ fontSize: 14, color: '#687076', fontWeight: '600' }}>Fermer</Text>
        </Pressable>
      </View>
    );
  }

  // Style appliqué dans la WebView pour styliser le canvas
  const webStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
      width: 100%;
      height: 100%;
    }
    .m-signature-pad--body {
      border: 2px dashed #C9A96E;
      border-radius: 8px;
    }
    .m-signature-pad--footer { display: none; }
    body, html {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      padding: 0;
    }
  `;

  // Callback déclenché par readSignature() quand le canvas a une signature
  const handleOK = (signature: string) => {
    // signature = "data:image/png;base64,iVBORw0KG..."
    onSave(signature);
  };

  // Callback si user tap "Valider" sans avoir signé (canvas vide)
  const handleEmpty = () => {
    // Ne rien faire — le user peut signer puis re-valider
  };

  const handleClear = () => {
    ref.current?.clearSignature();
  };

  // Déclenche le readSignature() qui appellera handleOK avec la base64
  const handleConfirm = () => {
    ref.current?.readSignature();
  };

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Canvas WebView */}
      <View style={{ width, height, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <SignatureView
          ref={ref}
          onOK={handleOK}
          onEmpty={handleEmpty}
          webStyle={webStyle}
          backgroundColor="#fff"
          penColor="#000"
          autoClear={false}
          descriptionText=""
          imageType="image/png"
        />
      </View>

      {/* Boutons d'action */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
        <Pressable
          onPress={onCancel}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#F5EDE3', borderRadius: 8 }}
        >
          <Text style={{ fontSize: 14, color: '#687076', fontWeight: '600' }}>Annuler</Text>
        </Pressable>
        <Pressable
          onPress={handleClear}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FFE5E0', borderRadius: 8 }}
        >
          <Text style={{ fontSize: 14, color: '#C0392B', fontWeight: '600' }}>Effacer</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#C9A96E', borderRadius: 8 }}
        >
          <Text style={{ fontSize: 14, color: '#fff', fontWeight: '700' }}>Valider</Text>
        </Pressable>
      </View>
    </View>
  );
}

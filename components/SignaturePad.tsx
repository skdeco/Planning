import React, { useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, PanResponder, Platform } from 'react-native';

interface Props {
  onSave: (base64: string) => void;
  onCancel: () => void;
  width?: number;
  height?: number;
  labels?: { signBelow?: string; draw?: string; clear?: string; cancel?: string; validate?: string };
}

/**
 * Composant de signature tactile.
 * Sur web : utilise un <canvas>.
 * Sur mobile : utilise PanResponder + SVG path.
 */
export function SignaturePad({ onSave, onCancel, width = 300, height = 150, labels }: Props) {
  if (Platform.OS === 'web') {
    return <SignaturePadWeb onSave={onSave} onCancel={onCancel} width={width} height={height} labels={labels} />;
  }
  return <SignaturePadMobile onSave={onSave} onCancel={onCancel} width={width} height={height} labels={labels} />;
}

// ── Web version (canvas) ──
function SignaturePadWeb({ onSave, onCancel, width, height, labels }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  const getCtx = () => canvasRef.current?.getContext('2d') || null;

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = getCtx(); if (!ctx) return;
    isDrawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const ctx = getCtx(); if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#11181C';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => { isDrawing.current = false; };

  const clear = () => {
    const ctx = getCtx(); if (!ctx) return;
    ctx.clearRect(0, 0, width!, height!);
  };

  const save = () => {
    if (!canvasRef.current) return;
    const data = canvasRef.current.toDataURL('image/png');
    onSave(data);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{labels?.signBelow || 'Signez ci-dessous :'}</Text>
      <View style={[styles.canvasWrap, { width, height }]}>
        <canvas
          ref={canvasRef as any}
          width={width}
          height={height}
          style={{ border: '1px dashed #B0BEC5', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' }}
          onMouseDown={startDraw as any}
          onMouseMove={draw as any}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw as any}
          onTouchMove={draw as any}
          onTouchEnd={endDraw}
        />
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.clearBtn} onPress={clear}>
          <Text style={styles.clearBtnText}>{labels?.clear || 'Effacer'}</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>{labels?.cancel || 'Annuler'}</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>{labels?.validate || 'Valider ✓'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Mobile version (PanResponder + SVG-like paths rendered as View lines) ──
function SignaturePadMobile({ onSave, onCancel, width, height, labels }: Props) {
  const [paths, setPaths] = useState<{ x: number; y: number }[][]>([]);
  const currentPath = useRef<{ x: number; y: number }[]>([]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => {
        currentPath.current = [{ x: gs.x0, y: gs.y0 }];
        setPaths(prev => [...prev, [{ x: gs.x0, y: gs.y0 }]]);
      },
      onPanResponderMove: (_, gs) => {
        currentPath.current.push({ x: gs.moveX, y: gs.moveY });
        setPaths(prev => [...prev.slice(0, -1), [...currentPath.current]]);
      },
      onPanResponderRelease: () => {
        setPaths(prev => [...prev]);
      },
    })
  ).current;

  const clear = () => { setPaths([]); currentPath.current = []; };

  const save = () => {
    // Sur mobile, on genere un simple marqueur "signed" avec timestamp
    // (pas de canvas disponible pour exporter en image)
    const timestamp = new Date().toISOString();
    onSave(`signed_mobile_${timestamp}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{labels?.signBelow || 'Signez ci-dessous :'}</Text>
      <View
        style={[styles.canvasWrap, { width, height, backgroundColor: '#fff', borderWidth: 1, borderColor: '#B0BEC5', borderStyle: 'dashed', borderRadius: 8, overflow: 'hidden' }]}
        {...panResponder.panHandlers}
      >
        {paths.map((path, pi) =>
          path.map((point, i) => {
            if (i === 0) return null;
            return (
              <View
                key={`${pi}_${i}`}
                style={{
                  position: 'absolute',
                  left: point.x - 1,
                  top: point.y - 1,
                  width: 3,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: '#11181C',
                }}
              />
            );
          })
        )}
        {paths.length === 0 && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#B0BEC5', fontSize: 13 }}>{labels?.draw || 'Dessinez votre signature'}</Text>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.clearBtn} onPress={clear}>
          <Text style={styles.clearBtnText}>{labels?.clear || 'Effacer'}</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>{labels?.cancel || 'Annuler'}</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>{labels?.validate || 'Valider ✓'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#11181C' },
  canvasWrap: { alignSelf: 'center' },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  clearBtn: { backgroundColor: '#F2F4F7', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  clearBtnText: { fontSize: 12, fontWeight: '600', color: '#687076' },
  cancelBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  saveBtn: { backgroundColor: '#1A3A6B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});

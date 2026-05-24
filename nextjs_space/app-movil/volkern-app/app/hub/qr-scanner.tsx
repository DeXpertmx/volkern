import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../../src/theme';

// ─── Tipos de datos escaneables ───────────────────────────────────────────────
type ScanResultType = 'url' | 'vcard' | 'email' | 'phone' | 'text' | 'volkern';

interface ScanResult {
  type: ScanResultType;
  raw: string;
  display: string;
  actionLabel: string;
  action: () => void;
}

// ─── Helpers (factory con colors) ─────────────────────────────────────────────
function createAnalyzer(colors: ReturnType<typeof useThemeColors>) {
  return {
    analyzeScan(data: string): ScanResult {
      const trimmed = data.trim();

      if (
        trimmed.includes('volkern.com') ||
        trimmed.includes('volkern.app') ||
        trimmed.includes('localhost:3000')
      ) {
        return {
          type: 'volkern',
          raw: trimmed,
          display: trimmed,
          actionLabel: 'Abrir en Volkern',
          action: () => Linking.openURL(trimmed).catch(() => {}),
        };
      }

      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return {
          type: 'url',
          raw: trimmed,
          display: trimmed,
          actionLabel: 'Abrir en navegador',
          action: () => Linking.openURL(trimmed).catch(() => {}),
        };
      }

      if (trimmed.startsWith('mailto:') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        const email = trimmed.replace(/^mailto:/, '');
        return {
          type: 'email',
          raw: email,
          display: email,
          actionLabel: 'Enviar correo',
          action: () => Linking.openURL(`mailto:${email}`).catch(() => {}),
        };
      }

      if (trimmed.startsWith('tel:') || /^[+\d\s\-()]{7,20}$/.test(trimmed)) {
        const phone = trimmed.replace(/^tel:/, '');
        return {
          type: 'phone',
          raw: phone,
          display: phone,
          actionLabel: 'Llamar',
          action: () => Linking.openURL(`tel:${phone}`).catch(() => {}),
        };
      }

      return {
        type: 'text',
        raw: trimmed,
        display: trimmed,
        actionLabel: 'Buscar en Volkern',
        action: () => {
          Alert.alert('Contenido escaneado', trimmed);
        },
      };
    },

    getTypeColor(type: ScanResultType): string {
      switch (type) {
        case 'url': return colors.primary;
        case 'volkern': return colors.primary;
        case 'vcard': return colors.success;
        case 'email': return colors.info;
        case 'phone': return colors.warning;
        case 'text': return colors.textSecondary;
      }
    },

    getTypeIcon(type: ScanResultType): keyof typeof Ionicons.glyphMap {
      switch (type) {
        case 'url': return 'globe';
        case 'volkern': return 'sparkles';
        case 'vcard': return 'card';
        case 'email': return 'mail';
        case 'phone': return 'call';
        case 'text': return 'document-text';
      }
    },

    getTypeLabel(type: ScanResultType): string {
      switch (type) {
        case 'url': return 'Enlace web';
        case 'volkern': return 'Enlace Volkern';
        case 'vcard': return 'Contacto';
        case 'email': return 'Correo electrónico';
        case 'phone': return 'Teléfono';
        case 'text': return 'Texto';
      }
    },

    getActionIcon(type: ScanResultType): keyof typeof Ionicons.glyphMap {
      switch (type) {
        case 'url': return 'open-outline';
        case 'volkern': return 'sparkles';
        case 'vcard': return 'person-add';
        case 'email': return 'send';
        case 'phone': return 'call';
        case 'text': return 'search';
      }
    },
  };
}

// ─── Scan Frame Overlay ───────────────────────────────────────────────────────
function ScanFrame({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  const borderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(borderAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(borderAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [borderAnim]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.primary, colors.primaryLight],
  });

  return (
    <View style={styles.frameContainer}>
      <Animated.View
        style={[
          styles.corner,
          styles.cornerTL,
          { borderColor, borderLeftWidth: 3, borderTopWidth: 3 },
        ]}
      />
      <Animated.View
        style={[
          styles.corner,
          styles.cornerTR,
          { borderColor, borderRightWidth: 3, borderTopWidth: 3 },
        ]}
      />
      <Animated.View
        style={[
          styles.corner,
          styles.cornerBL,
          { borderColor, borderLeftWidth: 3, borderBottomWidth: 3 },
        ]}
      />
      <Animated.View
        style={[
          styles.corner,
          styles.cornerBR,
          { borderColor, borderRightWidth: 3, borderBottomWidth: 3 },
        ]}
      />

      <Text style={styles.frameHint}>Apunta al código QR o código de barras</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function QRScannerScreen() {
  const colors = useThemeColors();
  const helpers = useMemo(() => createAnalyzer(colors), [colors]);
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [flashAnim] = useState(() => new Animated.Value(0));

  // ── Permisos ─────────────────────────────────────────────────────
  const handleRequestPermission = useCallback(async () => {
    const { granted } = await requestPermission();
    if (!granted) {
      Alert.alert(
        'Permiso de cámara requerido',
        'Para escanear códigos QR necesitamos acceso a la cámara. Puedes habilitarlo en Ajustes.',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => router.back() },
          { text: 'Configuración', onPress: () => Linking.openSettings() },
        ],
      );
    }
  }, [requestPermission, router]);

  // ── Scan handler ──────────────────────────────────────────────────
  const handleBarCodeScanned = useCallback(
    (scanResult: BarcodeScanningResult) => {
      if (scanned) return;
      setScanned(true);
      Vibration.vibrate(100);

      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 100, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
      ]).start();

      const analyzed = helpers.analyzeScan(scanResult.data);
      setResult(analyzed);
    },
    [scanned, flashAnim, helpers],
  );

  // ── Reset scan ────────────────────────────────────────────────────
  const handleRescan = useCallback(() => {
    setScanned(false);
    setResult(null);
  }, []);

  // ── Close ─────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // ── Permission not granted ────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Verificando permisos...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.permissionTitle}>Permiso de cámara</Text>
          <Text style={styles.permissionText}>
            Volkern necesita acceso a la cámara para escanear códigos QR y códigos de barras.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={handleRequestPermission}>
            <Text style={styles.permissionButtonText}>Conceder permiso</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={handleClose}>
            <Text style={styles.backLinkText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'pdf417', 'aztec', 'code128', 'code39', 'code93', 'datamatrix', 'ean13', 'ean8', 'itf14', 'upc_a', 'upc_e'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Flash overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.white,
            opacity: flashAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.6],
            }),
          },
        ]}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topButton} onPress={handleClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Escáner</Text>
        <TouchableOpacity
          style={[styles.topButton, torch && styles.topButtonActive]}
          onPress={() => setTorch(!torch)}
        >
          <Ionicons
            name={torch ? 'flashlight' : 'flashlight-outline'}
            size={24}
            color={torch ? colors.warning : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {/* Scan frame */}
      {!result && <ScanFrame colors={colors} />}

      {/* Result overlay */}
      {result && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={[styles.resultBadge, { backgroundColor: helpers.getTypeColor(result.type) + '20' }]}>
                <Ionicons
                  name={helpers.getTypeIcon(result.type)}
                  size={20}
                  color={helpers.getTypeColor(result.type)}
                />
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultType}>
                  {helpers.getTypeLabel(result.type)}
                </Text>
                <Text style={styles.resultData} numberOfLines={3}>
                  {result.display}
                </Text>
              </View>
            </View>

            <View style={styles.resultActions}>
              <TouchableOpacity
                style={[styles.resultButton, { backgroundColor: helpers.getTypeColor(result.type) }]}
                onPress={() => {
                  result.action();
                  handleClose();
                }}
              >
                <Ionicons name={helpers.getActionIcon(result.type)} size={18} color="#fff" />
                <Text style={styles.resultButtonText}>{result.actionLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.rescanButton} onPress={handleRescan}>
                <Ionicons name="scan-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.rescanText}>Escanear otro</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Hint at bottom */}
      {!result && (
        <View style={styles.bottomHint}>
          <Ionicons name="barcode-outline" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.bottomHintText}>
            Códigos QR, barras, PDF417 y más
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: '#999',
  },
  // Permission
  permissionTitle: {
    ...typography.h2,
    color: '#fff',
    textAlign: 'center',
  },
  permissionText: {
    ...typography.body,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  permissionButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  backLink: {
    marginTop: spacing.md,
    padding: spacing.md,
  },
  backLinkText: {
    ...typography.body,
    color: '#3B82F6',
    fontWeight: '600',
  },
  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    zIndex: 10,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topButtonActive: {
    backgroundColor: 'rgba(245,158,11,0.3)',
  },
  topTitle: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  // Scan frame
  frameContainer: {
    position: 'absolute',
    top: '30%',
    left: '15%',
    right: '15%',
    aspectRatio: 1,
    maxHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
  },
  cornerTL: { top: 0, left: 0 },
  cornerTR: { top: 0, right: 0 },
  cornerBL: { bottom: 0, left: 0 },
  cornerBR: { bottom: 0, right: 0 },
  frameHint: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    position: 'absolute',
    bottom: -40,
    left: 0,
    right: 0,
  },
  // Bottom hint
  bottomHint: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  bottomHintText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
  },
  // Result
  resultOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    zIndex: 20,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultInfo: {
    flex: 1,
  },
  resultType: {
    ...typography.caption,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultData: {
    ...typography.bodySmall,
    color: '#111',
    fontWeight: '500',
    marginTop: 2,
  },
  resultActions: {
    gap: spacing.sm,
  },
  resultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  resultButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  rescanText: {
    ...typography.bodySmall,
    color: '#666',
    fontWeight: '600',
  },
});

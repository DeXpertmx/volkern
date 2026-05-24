import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { networkService, type NetworkState } from '../services/network';
import { offlineQueue } from '../services/offline-queue';
import { colors, typography, spacing } from '../theme/tokens';

// ─── Context Type ─────────────────────────────────────────────────────────────
interface NetworkContextType {
  isOnline: boolean;
  networkState: NetworkState;
  syncProgress: number | null; // null = no syncing, 0-100 = progress %
  pendingCount: number; // pending operations in offline queue
  syncNow: () => Promise<void>; // manual trigger sync
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  networkState: {
    isConnected: true,
    status: 'online',
    isInternetReachable: true,
    details: null,
  },
  syncProgress: null,
  pendingCount: 0,
  syncNow: async () => {},
});

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useNetwork(): NetworkContextType {
  return useContext(NetworkContext);
}

// ─── Offline Banner ───────────────────────────────────────────────────────────
function OfflineBanner({ visible, pendingCount }: { visible: boolean; pendingCount: number }) {
  const [slideAnim] = useState(() => new Animated.Value(visible ? 0 : -60));
  const router = useRouter();

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -60,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.banner,
        {
          transform: [{ translateY: slideAnim }],
          opacity: slideAnim.interpolate({
            inputRange: [-60, 0],
            outputRange: [0, 1],
          }),
        },
      ]}
    >
      <TouchableOpacity
        style={styles.bannerContent}
        onPress={() => router.push('/hub/offline-sync')}
        activeOpacity={0.8}
      >
        <View style={styles.bannerLeft}>
          <View style={styles.bannerIconRow}>
            <Ionicons name="cloud-offline" size={16} color="#fff" />
            <Text style={styles.bannerTitle}>Sin conexión</Text>
          </View>
          {pendingCount > 0 && (
            <Text style={styles.bannerSub}>
              {pendingCount} operación(es) pendiente(s)
            </Text>
          )}
        </View>
        <View style={styles.bannerRight}>
          <Text style={styles.bannerAction}>Ver cola</Text>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Sync Banner ──────────────────────────────────────────────────────────────
function SyncBanner({ progress }: { progress: number | null }) {
  if (progress === null) return null;

  return (
    <TouchableOpacity
      style={styles.syncBanner}
      onPress={() => {
        /* could navigate to sync screen */
      }}
      activeOpacity={0.8}
    >
      <Ionicons name="sync" size={14} color={colors.primary} />
      <Text style={styles.syncText}>
        Sincronizando... {progress}%
      </Text>
      <View style={[styles.syncBar, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.syncBarFill,
            {
              width: `${progress}%`,
              backgroundColor: colors.primary,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    status: 'online',
    isInternetReachable: true,
    details: null,
  });
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // ─── Subscribe to network changes ────────────────────────────────────
  useEffect(() => {
    const unsubscribe = networkService.subscribe((state) => {
      setNetworkState(state);

      // Cuando se reconecta, disparar sincronización automática
      if (state.isConnected && state.isInternetReachable !== false) {
        triggerSync();
      }
    });

    return unsubscribe;
  }, []);

  // ─── Poll pending count periodically ─────────────────────────────────
  useEffect(() => {
    const updatePending = async () => {
      try {
        const ops = await offlineQueue.getPendingOperations();
        setPendingCount(ops.length);
      } catch {
        // ignore
      }
    };

    // Initial load
    updatePending();

    // Poll every 5 seconds
    const interval = setInterval(updatePending, 5000);
    return () => clearInterval(interval);
  }, []);

  // ─── Sync trigger ────────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    const count = offlineQueue.pendingCount;
    if (count === 0) return;

    setSyncProgress(0);
    try {
      await offlineQueue.replayQueue((progress) => {
        setSyncProgress(progress);
      });
    } catch {
      // Error en sync — la cola reintentará después
    } finally {
      setSyncProgress(null);
      // Refresh pending count after sync
      const ops = await offlineQueue.getPendingOperations();
      setPendingCount(ops.length);
    }
  }, []);

  // ─── Manual sync (exposed via context) ───────────────────────────────
  const syncNow = useCallback(async () => {
    await triggerSync();
  }, [triggerSync]);

  const isOnline = networkState.isConnected && networkState.isInternetReachable !== false;

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        networkState,
        syncProgress,
        pendingCount,
        syncNow,
      }}
    >
      <OfflineBanner visible={!isOnline} pendingCount={pendingCount} />
      <SyncBanner progress={syncProgress} />
      {children}
    </NetworkContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.error,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  bannerLeft: {
    flex: 1,
  },
  bannerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bannerTitle: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '700',
  },
  bannerSub: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
    marginLeft: 24,
    fontSize: 11,
  },
  bannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: spacing.md,
  },
  bannerAction: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    fontSize: 11,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryBg,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 99,
  },
  syncText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '500',
    fontSize: 11,
  },
  syncBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    maxWidth: 60,
  },
  syncBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, layout } from '../../src/theme';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationsCount } from '../../src/contexts/notifications';
import { useNetwork } from '../../src/contexts/network';

// ─── Tab Icon Helper ──────────────────────────────────────────────────────────
function TabIcon({ name, color, size }: { name: keyof typeof Ionicons.glyphMap; color: any; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotificationsCount();
  const { pendingCount } = useNetwork();
  const s = makeStyles(colors);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary as string,
        tabBarInactiveTintColor: colors.textTertiary as string,
        tabBarStyle: {
          height: Platform.OS === 'android'
            ? layout.tabBarHeight + Math.max(insets.bottom - 8, 0)
            : layout.tabBarHeight + Math.max(insets.bottom - 20, 0),
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : Math.max(insets.bottom, 8),
          paddingTop: 8,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
            },
            android: {
              elevation: 8,
            },
          }),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="gemma"
        options={{
          title: 'Gemma',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="chatbubble-ellipses" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notificaciones',
          tabBarIcon: ({ color, size }) => (
            <View>
              <TabIcon name="notifications" color={color} size={size} />
              {unreadCount > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="hubs"
        options={{
          title: 'Módulos',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="grid" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="calendar" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tareas',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="checkbox" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reportes',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="bar-chart" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <View>
              <TabIcon name="person" color={color} size={size} />
              {pendingCount > 0 && (
                <View style={[s.badge, { backgroundColor: colors.warning }]}>
                  <Ionicons name="cloud-upload" size={8} color={colors.white} />
                </View>
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});

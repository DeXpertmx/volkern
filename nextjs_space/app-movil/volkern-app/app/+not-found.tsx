import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius } from '../src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function NotFoundScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = makeStyles(colors);

  return (
    <View style={s.container}>
      <Ionicons name="map-outline" size={64} color={colors.textTertiary} />
      <Text style={s.title}>Página no encontrada</Text>
      <Text style={s.subtitle}>La pantalla que buscas no existe</Text>
      <TouchableOpacity
        style={s.button}
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={s.buttonText}>Ir al inicio</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 24,
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  buttonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '700',
  },
});

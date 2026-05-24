import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authService } from '../../src/services/auth';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { ApiClientError } from '../../src/services/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const s = useMemo(() => makeStyles(colors), [colors]);

  const handleSend = async () => {
    if (!email.trim()) { setError('Por favor ingresa tu email'); return; }
    setError('');
    setIsLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally { setIsLoading(false); }
  };

  if (sent) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successContainer}>
          <TouchableOpacity style={[s.backButton, { backgroundColor: colors.background }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.successContent}>
            <View style={s.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            </View>
            <Text style={s.successTitle}>Revisa tu email</Text>
            <Text style={s.successText}>Hemos enviado instrucciones para recuperar tu contraseña a <Text style={[s.successEmail, { color: colors.textPrimary }]}>{email}</Text></Text>
            <View style={[s.successInfoCard, { backgroundColor: colors.warningBg, borderColor: colors.warning + '20' }]}>
              <Ionicons name="time-outline" size={20} color={colors.warning} />
              <Text style={s.successInfoText}>El enlace expirará en 1 hora. Si no encuentras el email, revisa tu carpeta de spam.</Text>
            </View>
          </View>
          <TouchableOpacity style={s.backToLoginButton} onPress={() => router.replace('/auth/login')}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={s.backToLoginText}>Volver a iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={[s.backButton, { backgroundColor: colors.background }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.header}>
            <View style={[s.iconContainer, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="lock-open-outline" size={40} color={colors.primary} />
            </View>
            <Text style={s.title}>Recuperar contraseña</Text>
            <Text style={s.subtitle}>Ingresa tu email y te enviaremos instrucciones para restablecer tu contraseña</Text>
          </View>
          <View style={s.formSection}>
            {error ? (
              <View style={[s.errorBanner, { backgroundColor: colors.errorBg, borderColor: colors.error + '20' }]}>
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Email</Text>
              <View style={[s.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name="mail-outline" size={20} color={colors.textTertiary} />
                <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="tu@email.com" placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!isLoading} />
              </View>
            </View>
            <TouchableOpacity style={[s.sendButton, { backgroundColor: colors.primary }, isLoading && s.sendButtonDisabled]} onPress={handleSend} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={s.sendButtonText}>Enviar instrucciones</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.resetLink} onPress={() => router.push('/auth/reset-password')}>
              <Ionicons name="key-outline" size={18} color={colors.textTertiary} />
              <Text style={s.resetLinkText}>¿Ya tienes un token? Restablece tu contraseña</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: layout.screenPadding, paddingTop: spacing.xxl },
  successContainer: { flex: 1, padding: layout.screenPadding, paddingTop: spacing.xxl, justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  iconContainer: { width: 80, height: 80, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  formSection: { gap: spacing.lg },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  errorText: { ...typography.bodySmall, color: colors.error, flex: 1 },
  inputGroup: { gap: spacing.sm },
  inputLabel: { ...typography.label, color: colors.textPrimary },
  inputContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
  input: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: spacing.md },
  sendButton: { borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: spacing.sm, ...shadows.md },
  sendButtonDisabled: { opacity: 0.7 },
  sendButtonText: { ...typography.body, color: colors.white, fontWeight: '700' },
  resetLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  resetLinkText: { ...typography.bodySmall, color: colors.textTertiary },
  successContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  successIconContainer: { marginBottom: spacing.sm },
  successTitle: { ...typography.h2, color: colors.textPrimary },
  successText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  successEmail: { fontWeight: '600' },
  successInfoCard: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'flex-start', marginTop: spacing.md },
  successInfoText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  backToLoginButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, marginBottom: spacing.xxl },
  backToLoginText: { ...typography.body, color: colors.primary, fontWeight: '600' },
});

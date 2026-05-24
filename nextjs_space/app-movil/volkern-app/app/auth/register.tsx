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
import { useAuth } from '../../src/contexts/auth';
import { authService } from '../../src/services/auth';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { ApiClientError } from '../../src/services/api';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

export default function RegisterScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { signIn } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const s = useMemo(() => makeStyles(colors), [colors]);

  const validateStep1 = (): boolean => {
    if (!fullName.trim()) { setError('Por favor ingresa tu nombre completo'); return false; }
    if (!email.trim()) { setError('Por favor ingresa tu email'); return false; }
    if (!password) { setError('Por favor ingresa una contraseña'); return false; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return false; }
    if (!PASSWORD_REGEX.test(password)) { setError('La contraseña debe incluir mayúsculas, minúsculas y al menos un carácter especial'); return false; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return false; }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!companyName.trim()) { setError('Por favor ingresa el nombre de tu empresa'); return false; }
    return true;
  };

  const handleRegister = async () => {
    if (step === 1) {
      if (!validateStep1()) return;
      setError('');
      setStep(2);
      return;
    }
    if (!validateStep2()) return;
    setError('');
    setIsLoading(true);
    try {
      await authService.register({ email: email.trim(), password, fullName: fullName.trim(), companyName: companyName.trim() });
      await signIn(email.trim(), password);
      router.replace('/onboarding');
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally { setIsLoading(false); }
  };

  const renderStepIndicator = () => (
    <View style={s.stepIndicator}>
      <View style={[s.stepDot, step >= 1 && { backgroundColor: colors.primary }]}>
        <Text style={[s.stepDotText, step >= 1 && { color: colors.white }]}>1</Text>
      </View>
      <View style={[s.stepLine, step >= 2 && { backgroundColor: colors.primary }]} />
      <View style={[s.stepDot, step >= 2 && { backgroundColor: colors.primary }]}>
        <Text style={[s.stepDotText, step >= 2 && { color: colors.white }]}>2</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={[s.backButton, { backgroundColor: colors.background }]} onPress={() => step === 1 ? router.back() : setStep(1)}>
            <Ionicons name={step === 1 ? 'arrow-back' : 'chevron-back'} size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.header}>
            <View style={[s.logoContainer, { backgroundColor: colors.primary }]}>
              <Ionicons name="sparkles" size={32} color={colors.white} />
            </View>
            <Text style={s.title}>Crear cuenta</Text>
            <Text style={s.subtitle}>{step === 1 ? 'Completa tus datos personales' : 'Configura tu empresa'}</Text>
          </View>
          {renderStepIndicator()}
          <View style={s.formSection}>
            {error ? (
              <View style={[s.errorBanner, { backgroundColor: colors.errorBg, borderColor: colors.error + '20' }]}>
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
            {step === 1 ? (
              <>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Nombre completo</Text>
                  <View style={[s.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="person-outline" size={20} color={colors.textTertiary} />
                    <TextInput style={s.input} value={fullName} onChangeText={setFullName} placeholder="Tu nombre" placeholderTextColor={colors.textTertiary} autoCapitalize="words" editable={!isLoading} />
                  </View>
                </View>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Email</Text>
                  <View style={[s.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="mail-outline" size={20} color={colors.textTertiary} />
                    <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="tu@email.com" placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!isLoading} />
                  </View>
                </View>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Contraseña</Text>
                  <View style={[s.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
                    <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.textTertiary} secureTextEntry={!showPassword} editable={!isLoading} />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.passwordHint, { color: colors.textTertiary }]}>Mín. 8 caracteres, mayúscula, minúscula y carácter especial</Text>
                </View>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Confirmar contraseña</Text>
                  <View style={[s.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
                    <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" placeholderTextColor={colors.textTertiary} secureTextEntry={!showConfirmPassword} editable={!isLoading} />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Nombre de la empresa</Text>
                  <View style={[s.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="business-outline" size={20} color={colors.textTertiary} />
                    <TextInput style={s.input} value={companyName} onChangeText={setCompanyName} placeholder="Mi Empresa" placeholderTextColor={colors.textTertiary} autoCapitalize="words" editable={!isLoading} />
                  </View>
                  <Text style={[s.passwordHint, { color: colors.textTertiary }]}>Este será el nombre de tu espacio de trabajo en Volkern</Text>
                </View>
                <View style={[s.infoCard, { backgroundColor: colors.infoBg, borderColor: colors.info + '20' }]}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.info} />
                  <Text style={s.infoText}>Recibirás un periodo de prueba gratuito para explorar todas las funcionalidades de Volkern.</Text>
                </View>
              </>
            )}
            <TouchableOpacity style={[s.submitButton, { backgroundColor: colors.primary }, isLoading && s.submitButtonDisabled]} onPress={handleRegister} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={s.submitButtonText}>{step === 1 ? 'Continuar' : 'Crear cuenta'}</Text>}
            </TouchableOpacity>
            <View style={s.footer}>
              <Text style={s.footerText}>¿Ya tienes cuenta? </Text>
              <TouchableOpacity onPress={() => router.replace('/auth/login')}><Text style={s.footerLink}>Inicia sesión</Text></TouchableOpacity>
            </View>
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
  backButton: { width: 40, height: 40, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  logoContainer: { width: 60, height: 60, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md, ...shadows.md },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xxl },
  stepDot: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  stepDotText: { ...typography.caption, fontWeight: '700', color: colors.textTertiary },
  stepLine: { width: 60, height: 2, backgroundColor: colors.borderLight, marginHorizontal: spacing.sm },
  formSection: { gap: spacing.lg },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  errorText: { ...typography.bodySmall, color: colors.error, flex: 1 },
  inputGroup: { gap: spacing.sm },
  inputLabel: { ...typography.label, color: colors.textPrimary },
  inputContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
  input: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: spacing.md },
  passwordHint: { ...typography.caption, marginTop: -spacing.xs },
  infoCard: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'flex-start' },
  infoText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  submitButton: { borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: spacing.sm, ...shadows.md },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { ...typography.body, color: colors.white, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.md },
  footerText: { ...typography.bodySmall, color: colors.textSecondary },
  footerLink: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
});

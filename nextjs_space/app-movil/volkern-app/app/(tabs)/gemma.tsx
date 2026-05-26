import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import type { ChatMessage } from '../../src/services/chat';
import { chatService, responseToMessages } from '../../src/services/chat';
import gemmaBotImage from '../../assets/images/gemma-bot.png';

// ─── Constants ────────────────────────────────────────────────────────────────
const RECORDING_LEVELS = 5;
const WAVE_COLORS = ['#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF'];

// ─── Component ────────────────────────────────────────────────────────────────
export default function GemmaChatScreen() {
  const colors = useThemeColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: t('gemma', 'emptyTitle') + ' ' + t('gemma', 'emptySub'),
      timestamp: new Date().toISOString(),
      type: 'text',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const micScale = useRef(new Animated.Value(1)).current;

  // ─── Simulación de niveles de grabación ─────────────────────────────────────
  useEffect(() => {
    if (!isRecording) {
      setRecordingLevel(0);
      return;
    }

    const interval = setInterval(() => {
      setRecordingLevel(Math.floor(Math.random() * RECORDING_LEVELS));
    }, 200);

    // Animación de pulso en micrófono
    Animated.loop(
      Animated.sequence([
        Animated.timing(micScale, {
          toValue: 1.15,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(micScale, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    return () => {
      clearInterval(interval);
      micScale.setValue(1);
    };
  }, [isRecording, micScale]);

  // ─── Suggestions (depend on locale) ──────────────────────────────────────────
  const suggestions = useMemo(() => [
    t('gemma', 'suggestedSales'),
    t('gemma', 'suggestedSchedule'),
    t('gemma', 'suggestedTasks'),
    t('gemma', 'suggestedReport'),
  ], [t]);

  // ─── Enviar mensaje ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowSuggestions(false);
    setIsLoading(true);

    // Scroll al final
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const response = await chatService.sendMessage({ message: text.trim() });
      const newMessages = responseToMessages(response);
      setMessages(prev => [...prev, ...newMessages]);
      setShowSuggestions(true);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('gemma', 'errorMessage'),
        timestamp: new Date().toISOString(),
        type: 'error',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // ─── Iniciar/detener grabación ──────────────────────────────────────────────
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      // Simular envío de voz
      sendMessage('🎤 [Mensaje de voz]');
    } else {
      setIsRecording(true);
    }
  }, [isRecording, sendMessage]);

  // ─── Pick Image from Gallery ──────────────────────────────────────────────
  const handlePickImage = useCallback(async () => {
    setShowAttachmentSheet(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('common', 'permissionDenied'), t('common', 'galleryPermissionText'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Enviar como adjunto al chat
        setMessages(prev => [...prev, {
          id: `user-${Date.now()}`,
          role: 'user',
          content: `📷 [Imagen adjunta]`,
          timestamp: new Date().toISOString(),
          type: 'text',
        }]);
        setIsLoading(true);
        try {
          const response = await chatService.uploadAttachment(asset.uri, asset.mimeType || 'image/jpeg');
          const newMessages = responseToMessages(response);
          setMessages(prev => [...prev, ...newMessages]);
        } catch {
          setMessages(prev => [...prev, {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: t('common', 'imageErrorText'),
            timestamp: new Date().toISOString(),
            type: 'error',
          }]);
        } finally {
          setIsLoading(false);
        }
      }
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('common', 'galleryErrorText'));
    }
  }, []);

  // ─── Pick Document ────────────────────────────────────────────────────────
  const handlePickDocument = useCallback(async () => {
    setShowAttachmentSheet(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.name || 'documento';
        const fileSize = asset.size ? ` (${(asset.size / 1024).toFixed(0)} KB)` : '';

        setMessages(prev => [...prev, {
          id: `user-${Date.now()}`,
          role: 'user',
          content: `📎 [Documento: ${fileName}${fileSize}]`,
          timestamp: new Date().toISOString(),
          type: 'text',
        }]);

        setIsLoading(true);
        try {
          const response = await chatService.uploadAttachment(asset.uri, asset.mimeType || 'application/octet-stream');
          const newMessages = responseToMessages(response);
          setMessages(prev => [...prev, ...newMessages]);
        } catch {
          setMessages(prev => [...prev, {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: t('common', 'documentErrorText'),
            timestamp: new Date().toISOString(),
            type: 'error',
          }]);
        } finally {
          setIsLoading(false);
        }
      }
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('common', 'documentPickerErrorText'));
    }
  }, []);

  // ─── Manejar sugerencia ────────────────────────────────────────────────────
  const handleSuggestion = useCallback((suggestion: string) => {
    sendMessage(suggestion);
  }, [sendMessage]);

  // ─── Renderizar burbuja de mensaje ─────────────────────────────────────────
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const data = item as any;
    const isUser = data.role === 'user';
    const isError = data.type === 'error';

    return (
      <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Image source={gemmaBotImage} style={styles.botAvatarImage} />
          </View>
        )}
        <View style={styles.messageContent}>
          <View
            style={[
              styles.bubble,
              isUser ? styles.bubbleUser : styles.bubbleBot,
              isError && styles.bubbleError,
            ]}
          >
            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
              {data.content}
            </Text>
          </View>

          {/* Rich Card */}
          {data.type === 'card' && data.metadata?.card && (
            <View style={styles.richCard}>
              <View style={styles.richCardHeader}>
                <Ionicons
                  name={data.metadata.card.type === 'lead' ? 'person' : data.metadata.card.type === 'cita' ? 'calendar' : 'information-circle'}
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.richCardTitle}>{data.metadata.card.title}</Text>
              </View>
              <Text style={styles.richCardDesc}>{data.metadata.card.description}</Text>
              {data.metadata.card.data && (
                <View style={styles.richCardData}>
                  {Object.keys(data.metadata.card.data).map((key: string) => (
                    <View key={key} style={styles.richCardRow}>
                      <Text style={styles.richCardKey}>{key}:</Text>
                      <Text style={styles.richCardValue}>{String(data.metadata.card.data[key])}</Text>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity style={styles.richCardButton}>                  <Text style={styles.richCardButtonText}>{t('common', 'viewDetails')}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Action Buttons */}
          {data.type === 'action' && data.metadata?.actions && (
            <View style={styles.actionRow}>
              {data.metadata.actions.map((action: any, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.actionButton}
                  onPress={() => sendMessage(action.action)}
                >
                  <Text style={styles.actionButtonText}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  // ─── Attachment Bottom Sheet ────────────────────────────────────────────────
  const renderAttachmentSheet = () => {
    if (!showAttachmentSheet) return null;
    return (
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => setShowAttachmentSheet(false)}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />            <Text style={styles.sheetTitle}>{t('gemma', 'attach')}</Text>
          <View style={styles.sheetGrid}>
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowAttachmentSheet(false);
                router.push('/hub/qr-scanner');
              }}
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.primaryBg }]}>
                <Ionicons name="camera" size={24} color={colors.primary} />
              </View>
              <Text style={styles.sheetLabel}>{t('common', 'camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={handlePickImage}
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.successBg }]}>
                <Ionicons name="images" size={24} color={colors.success} />
              </View>
              <Text style={styles.sheetLabel}>{t('common', 'gallery')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={handlePickDocument}
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.warningBg }]}>
                <Ionicons name="document" size={24} color={colors.warning} />
              </View>
              <Text style={styles.sheetLabel}>{t('common', 'document')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowAttachmentSheet(false);
                router.push('/hub/qr-scanner');
              }}
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.infoBg }]}>
                <Ionicons name="qr-code" size={24} color={colors.info} />
              </View>
              <Text style={styles.sheetLabel}>{t('common', 'qrBarcode')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Image source={gemmaBotImage} style={styles.headerAvatarImage} />
          </View>
          <View>
            <Text style={styles.headerTitle}>{t('gemma', 'title')}</Text>
            <Text style={styles.headerStatus}>{t('common', 'online')}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/hub/qr-scanner')}
        >
          <Ionicons name="scan-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={insets.top + 60}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListFooterComponent={
            isLoading ? (
              <View style={styles.typingIndicator}>
                <View style={styles.botAvatarSmall}>
                  <Image source={gemmaBotImage} style={styles.botAvatarSmallImage} />
                </View>
                <View style={styles.typingDots}>
                  <View style={[styles.dot, styles.dot1]} />
                  <View style={[styles.dot, styles.dot2]} />
                  <View style={[styles.dot, styles.dot3]} />
                </View>
              </View>
            ) : null
          }
        />

        {/* Suggestions */}
        {showSuggestions && !isLoading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.suggestionsContainer}
            contentContainerStyle={styles.suggestionsContent}
          >
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionChip}
                onPress={() => handleSuggestion(suggestion)}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Voice Recording Indicator */}
        {isRecording && (
          <View style={styles.recordingBar}>
            <View style={styles.waveContainer}>
              {Array.from({ length: RECORDING_LEVELS }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveBar,
                    {
                      height: 8 + (i <= recordingLevel ? i * 6 : 0),
                      backgroundColor: WAVE_COLORS[i],
                    },
                  ]}
                />
              ))}
            </View>              <Text style={styles.recordingText}>{t('common', 'recording')}</Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => setShowAttachmentSheet(true)}
          >
            <Ionicons name="add-circle" size={28} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={t('gemma', 'placeholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
              onFocus={() => setShowSuggestions(false)}
            />
          </View>
          {input.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={() => sendMessage(input)}
            >
              <Ionicons name="send" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonActive]}
              onPress={toggleRecording}
            >
              <Animated.View style={{ transform: [{ scale: micScale }] }}>
                <Ionicons
                  name={isRecording ? 'stop' : 'mic'}
                  size={24}
                  color={isRecording ? colors.white : colors.primary}
                />
              </Animated.View>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {renderAttachmentSheet()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      backgroundColor: colors.white,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    headerAvatar: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: colors.white,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    headerAvatarImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    headerTitle: {
      ...typography.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    headerStatus: {
      ...typography.caption,
      color: colors.success,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Messages
    messageList: {
      flex: 1,
    },
    messageListContent: {
      padding: layout.screenPadding,
      paddingBottom: spacing.sm,
    },
    messageRow: {
      flexDirection: 'row',
      marginBottom: spacing.md,
      alignItems: 'flex-end',
      maxWidth: '88%',
    },
    messageRowUser: {
      alignSelf: 'flex-end',
    },
    botAvatar: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: colors.white,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.sm,
      marginBottom: 2,
      overflow: 'hidden',
    },
    botAvatarImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    messageContent: {
      flex: 1,
    },
    bubble: {
      borderRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    bubbleUser: {
      backgroundColor: colors.chatUser,
      borderBottomRightRadius: radius.sm,
    },
    bubbleBot: {
      backgroundColor: colors.chatBot,
      borderBottomLeftRadius: radius.sm,
    },
    bubbleError: {
      backgroundColor: colors.errorBg,
      borderWidth: 1,
      borderColor: colors.error + '30',
    },
    bubbleText: {
      ...typography.body,
      color: colors.textPrimary,
    },
    bubbleTextUser: {
      color: colors.textInverse,
    },
    // Rich Card
    richCard: {
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    richCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    richCardTitle: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    richCardDesc: {
      ...typography.caption,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    richCardData: {
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      paddingTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    richCardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    richCardKey: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    richCardValue: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    richCardButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.primaryBg,
    },
    richCardButtonText: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: colors.primary,
    },
    // Action Buttons
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    actionButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.primaryBg,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    actionButtonText: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: colors.primary,
    },
    // Suggestions
    suggestionsContainer: {
      maxHeight: 44,
      marginBottom: spacing.sm,
    },
    suggestionsContent: {
      paddingHorizontal: layout.screenPadding,
      gap: spacing.sm,
    },
    suggestionChip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    suggestionText: {
      ...typography.bodySmall,
      color: colors.textSecondary,
    },
    // Typing
    typingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    botAvatarSmall: {
      width: 24,
      height: 24,
      borderRadius: radius.full,
      backgroundColor: colors.white,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.sm,
      overflow: 'hidden',
    },
    botAvatarSmallImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    typingDots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.chatBot,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.xl,
      borderBottomLeftRadius: radius.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
      backgroundColor: colors.textTertiary,
    },
    dot1: { opacity: 0.4 },
    dot2: { opacity: 0.7 },
    dot3: { opacity: 1 },
    // Recording
    recordingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      backgroundColor: colors.white,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    waveContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      height: 40,
    },
    waveBar: {
      width: 4,
      borderRadius: 2,
      minHeight: 8,
    },
    recordingText: {
      ...typography.bodySmall,
      color: colors.error,
      fontWeight: '600',
    },
    // Input
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.white,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    attachButton: {
      padding: spacing.xs,
    },
    inputContainer: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      maxHeight: 100,
    },
    input: {
      ...typography.body,
      color: colors.textPrimary,
      paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
      maxHeight: 80,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    micButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.primaryBg,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    micButtonActive: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },
    // Attachment Sheet
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: layout.screenPadding,
      paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: spacing.lg,
    },
    sheetTitle: {
      ...typography.h3,
      color: colors.textPrimary,
      marginBottom: spacing.lg,
    },
    sheetGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    sheetOption: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    sheetIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.xl,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sheetLabel: {
      ...typography.caption,
      color: colors.textSecondary,
    },
  });
}

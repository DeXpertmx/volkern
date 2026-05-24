import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { chatService, ChatMessage, ChatResponse } from '../../src/services/chat';

const SUGGESTIONS = ['suggestedSales', 'suggestedTasks', 'suggestedSchedule'];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setConversationStarted(true);

    try {
      const response = await chatService.sendMessage({ message: text.trim() });
      const assistantMsg: ChatMessage = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
        type: response.card ? 'card' : 'text',
        metadata: response.card ? { card: response.card } : undefined,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: t('gemma', 'errorMessage'),
        timestamp: new Date().toISOString(),
        type: 'error',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (key: string) => {
    sendMessage(t('gemma', key));
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[s.msgRow, isUser && s.msgRowUser]}>
        {!isUser && (
          <View style={s.avatar}>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </View>
        )}
        <View style={[s.msgBubble, isUser ? s.msgBubbleUser : s.msgBubbleAI]}>
          {item.type === 'error' ? (
            <Text style={[s.msgText, { color: '#EF4444' }]}>{item.content}</Text>
          ) : item.type === 'card' && item.metadata?.card ? (
            <View>
              <Text style={[s.msgText, isUser ? { color: '#fff' } : { color: colors.textPrimary }]}>
                {item.content}
              </Text>
              {(item.metadata.card as any)?.title && (
                <View style={[s.cardPreview, { backgroundColor: colors.surface }]}>
                  <Text style={[s.cardTitle, { color: colors.textPrimary }]}>
                    {(item.metadata.card as any).title}
                  </Text>
                  <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
                    {(item.metadata.card as any).description}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={[s.msgText, isUser ? { color: '#fff' } : { color: colors.textPrimary }]}>
              {item.content}
            </Text>
          )}
          <Text style={[s.msgTime, isUser ? { color: 'rgba(255,255,255,0.7)' } : { color: colors.textSecondary }]}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={s.emptyContainer}>
      <View style={s.emptyIconWrap}>
        <Ionicons name="sparkles" size={48} color={colors.primary} />
      </View>
      <Text style={s.emptyTitle}>{t('gemma', 'emptyTitle')}</Text>
      <Text style={s.emptySub}>{t('gemma', 'emptySub')}</Text>
      <View style={s.suggestionsWrap}>
        {SUGGESTIONS.map(sug => (
          <TouchableOpacity
            key={sug}
            style={[s.suggestionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => handleSuggestion(sug)}
          >
            <Text style={[s.suggestionText, { color: colors.textPrimary }]}>{t('gemma', sug)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[s.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerAvatar}>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </View>
          <View>
            <Text style={s.headerTitle}>{t('gemma', 'title')}</Text>
            <Text style={s.headerSub}>{loading ? t('gemma', 'thinking') : 'Online'}</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 16, flexGrow: 1 }}
        ListEmptyComponent={renderEmpty}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input */}
      <View style={[s.inputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[s.textInput, { color: colors.textPrimary, backgroundColor: colors.background }]}
          placeholder={t('gemma', 'placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[s.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.textSecondary + '50' }]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim()}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  headerSub: { fontSize: 12, color: '#10B981' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  suggestionsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  suggestionChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  suggestionText: { fontSize: 14, fontWeight: '500' },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  msgBubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  msgBubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  msgBubbleAI: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  cardPreview: { marginTop: 8, padding: 10, borderRadius: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardDesc: { fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, gap: 8 },
  textInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});

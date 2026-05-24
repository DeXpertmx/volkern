import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { useAuth } from '../../src/contexts/auth';
import {
  feedbackService, type Feedback, type FeedbackType,
  FEEDBACK_TYPES, FEEDBACK_STATUSES,
} from '../../src/services/feedback';

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const { user } = useAuth();
  const s = makeStyles(colors, insets);

  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number>; byStatus: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form
  const [formType, setFormType] = useState<FeedbackType>('feature');
  const [formMessage, setFormMessage] = useState('');
  const [formRating, setFormRating] = useState(0);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, st] = await Promise.all([
        feedbackService.getAll(),
        feedbackService.getStats(),
      ]);
      setFeedback(data);
      setStats(st);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSubmit = async () => {
    if (!formMessage.trim()) {
      Alert.alert(t('common', 'error'), t('feedback', 'messagePlaceholder'));
      return;
    }
    try {
      await feedbackService.create(
        { type: formType, message: formMessage.trim(), rating: formRating },
        user?.id || 'anonymous',
        user?.name || 'Anonymous',
      );
      setModalVisible(false);
      setFormMessage('');
      setFormRating(0);
      setFormType('feature');
      loadData();
      Alert.alert(t('feedback', 'thanks'), t('feedback', 'thanksSub'));
    } catch {
      Alert.alert(t('common', 'error'), '');
    }
  };

  const renderItem = ({ item }: { item: Feedback }) => {
    const typeConfig = FEEDBACK_TYPES.find(t => t.value === item.type);
    const statusConfig = FEEDBACK_STATUSES.find(s => s.value === item.status);
    return (
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <View style={s.cardRow}>
          <View style={[s.cardIcon, { backgroundColor: (typeConfig?.color || '#64748B') + '15' }]}>
            <Ionicons name={(typeConfig?.icon || 'ellipsis-horizontal') as any} size={20} color={typeConfig?.color || '#64748B'} />
          </View>
          <View style={s.cardContent}>
            <Text style={[s.cardType, { color: typeConfig?.color || colors.textSecondary }]}>
              {typeConfig?.label || item.type}
            </Text>
            <Text style={[s.cardMessage, { color: colors.textPrimary }]} numberOfLines={2}>{item.message}</Text>
            <View style={s.cardMeta}>
              <Text style={[s.cardUser, { color: colors.textTertiary }]}>{item.userName}</Text>
              <Text style={[s.cardDot, { color: colors.textTertiary }]}>·</Text>
              <Text style={[s.cardDate, { color: colors.textTertiary }]}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
          {statusConfig && (
            <View style={[s.statusBadge, { backgroundColor: statusConfig.color + '15' }]}>
              <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
              <Text style={[s.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </View>
          )}
        </View>
        {item.rating > 0 && (
          <View style={s.ratingRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <Ionicons key={star} name={star <= item.rating ? 'star' : 'star-outline'} size={14} color={star <= item.rating ? '#F59E0B' : colors.textTertiary} />
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={feedback}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>{t('feedback', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setModalVisible(true)}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {stats && (
              <View style={s.statsRow}>
                <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                  <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
                  <Text style={[s.statLabel, { color: colors.textSecondary }]}>{t('feedback', 'recent')}</Text>
                </View>
                {FEEDBACK_TYPES.map(type => (
                  <View key={type.value} style={[s.statCard, { backgroundColor: colors.surface }]}>
                    <Text style={[s.statValue, { color: type.color }]}>{(stats.byType[type.value] || 0)}</Text>
                    <Ionicons name={type.icon as any} size={14} color={type.color} />
                  </View>
                ))}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('feedback', 'noFeedback')}</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>{t('feedback', 'noFeedbackSub')}</Text>
          </View>
        }
      />

      {/* New Feedback Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('feedback', 'submit')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody}>
              {/* Type selector */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('feedback', 'message')}</Text>
              <View style={s.typeRow}>
                {FEEDBACK_TYPES.map(type => (
                  <TouchableOpacity
                    key={type.value}
                    style={[s.typeChip, formType === type.value && { backgroundColor: type.color + '20', borderColor: type.color }]}
                    onPress={() => setFormType(type.value)}
                  >
                    <Ionicons name={type.icon as any} size={16} color={formType === type.value ? type.color : colors.textSecondary} />
                    <Text style={[s.typeText, { color: formType === type.value ? type.color : colors.textSecondary }]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Rating */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('feedback', 'rating')}</Text>
              <View style={s.ratingInputRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity key={star} onPress={() => setFormRating(star === formRating ? 0 : star)}>
                    <Ionicons name={star <= formRating ? 'star' : 'star-outline'} size={32} color={star <= formRating ? '#F59E0B' : colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Message */}
              <TextInput
                style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('feedback', 'messagePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={formMessage}
                onChangeText={setFormMessage}
                multiline
                numberOfLines={5}
              />
            </ScrollView>
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setModalVisible(false)}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }]} onPress={handleSubmit}>
                <Text style={s.modalSaveText}>{t('feedback', 'submit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11 },
  card: { borderRadius: 12, marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', gap: 10 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1 },
  cardType: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  cardMessage: { fontSize: 14, marginTop: 2, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardUser: { fontSize: 11 },
  cardDot: { fontSize: 11 },
  cardDate: { fontSize: 11 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', gap: 2, marginTop: 8 },
  emptyText: { fontSize: 15, marginTop: 12, marginBottom: 4 },
  emptySub: { fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  modalBody: { padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border },
  typeText: { fontSize: 13, fontWeight: '500' },
  ratingInputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, minHeight: 120, textAlignVertical: 'top', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12, padding: 16, paddingTop: 0, paddingBottom: insets.bottom + 16 },
  modalCancel: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  modalCancelText: { fontSize: 16, fontWeight: '600' },
  modalSave: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12 },
  modalSaveText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});

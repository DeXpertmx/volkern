import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  integrationsService, type Integration,
  AVAILABLE_INTEGRATIONS, type IntegrationProvider,
} from '../../src/services/integrations';

export default function IntegrationsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [configModal, setConfigModal] = useState<Integration | null>(null);
  const [configValue, setConfigValue] = useState('');

  const [activeTab, setActiveTab] = useState<'connected' | 'available'>('connected');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await integrationsService.getAll();
      setIntegrations(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const connectedProviders = integrations.map(i => i.provider);
  const availableItems = AVAILABLE_INTEGRATIONS.filter(a => !connectedProviders.includes(a.provider));

  const handleConnect = async (provider: IntegrationProvider) => {
    try {
      await integrationsService.connect(provider, {});
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('integrations', ''));
    }
  };

  const handleDisconnect = (item: Integration) => {
    Alert.alert(
      t('integrations', 'disconnect'),
      t('integrations', 'disconnectConfirm', { name: item.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await integrationsService.disconnect(item.id); loadData(); },
        },
      ]
    );
  };

  const handleSync = async (item: Integration) => {
    await integrationsService.sync(item.id);
    loadData();
  };

  const handleSaveConfig = async () => {
    if (!configModal) return;
    try {
      await integrationsService.updateConfig(configModal.id, { [configModal.provider === 'custom_webhook' ? 'webhookUrl' : 'apiKey']: configValue });
      setConfigModal(null);
      setConfigValue('');
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('integrations', ''));
    }
  };

  const renderConnected = ({ item }: { item: Integration }) => (
    <View style={[s.card, { backgroundColor: colors.surface }]}>
      <View style={s.cardRow}>
        <View style={[s.cardIcon, { backgroundColor: item.color + '15' }]}>
          <Ionicons name={item.icon as any} size={22} color={item.color} />
        </View>
        <View style={s.cardContent}>
          <Text style={[s.cardName, { color: colors.textPrimary }]}>{item.name}</Text>
          <Text style={[s.cardDesc, { color: colors.textSecondary }]}>{item.description}</Text>
          {item.lastSync && (
            <Text style={[s.cardSync, { color: colors.textTertiary }]}>
              {t('integrations', 'lastSync')}: {new Date(item.lastSync).toLocaleDateString()}
            </Text>
          )}
        </View>
        <View style={s.cardStatus}>
          <View style={[s.statusDot, { backgroundColor: item.status === 'connected' ? '#10B981' : item.status === 'error' ? '#EF4444' : '#F59E0B' }]} />
        </View>
      </View>
      <View style={s.cardActions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => handleSync(item)}>
          <Ionicons name="sync" size={16} color={colors.primary} />
          <Text style={[s.actionText, { color: colors.primary }]}>{t('integrations', 'syncNow')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => { setConfigModal(item); setConfigValue(item.config[item.provider === 'custom_webhook' ? 'webhookUrl' : 'apiKey'] || ''); }}>
          <Ionicons name="settings-outline" size={16} color={colors.textSecondary} />
          <Text style={[s.actionText, { color: colors.textSecondary }]}>{t('integrations', 'configure')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => handleDisconnect(item)}>
          <Ionicons name="link-outline" size={16} color="#EF4444" />
          <Text style={[s.actionText, { color: '#EF4444' }]}>{t('integrations', 'disconnect')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAvailable = ({ item }: { item: typeof AVAILABLE_INTEGRATIONS[0] }) => (
    <TouchableOpacity style={[s.availCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => handleConnect(item.provider)}>
      <View style={[s.availIcon, { backgroundColor: item.color + '10' }]}>
        <Ionicons name={item.icon as any} size={24} color={item.color} />
      </View>
      <Text style={[s.availName, { color: colors.textPrimary }]}>{item.name}</Text>
      <Text style={[s.availDesc, { color: colors.textSecondary }]}>{item.description}</Text>
      <View style={[s.connectBadge, { backgroundColor: colors.primary }]}>
        <Text style={s.connectBadgeText}>{t('integrations', 'connect')}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>{t('integrations', 'title')}</Text>
      </View>

      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tab, activeTab === 'connected' && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setActiveTab('connected')}>
          <Text style={[s.tabText, { color: activeTab === 'connected' ? '#fff' : colors.textSecondary }]}>
            {t('integrations', 'connected')} ({integrations.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'available' && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setActiveTab('available')}>
          <Text style={[s.tabText, { color: activeTab === 'available' ? '#fff' : colors.textSecondary }]}>
            {t('integrations', 'available')} ({availableItems.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'connected' ? (
        <FlatList
          data={integrations}
          keyExtractor={item => item.id}
          renderItem={renderConnected}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name={'puzzle-outline' as any} size={48} color={colors.textSecondary} />
              <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('integrations', 'noIntegrations')}</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>{t('integrations', 'noIntegrationsSub')}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={availableItems}
          keyExtractor={item => item.provider}
          renderItem={renderAvailable}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        />
      )}

      {/* Config Modal */}
      <Modal visible={!!configModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('integrations', 'configure')}</Text>
              <TouchableOpacity onPress={() => setConfigModal(null)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
              {configModal?.provider === 'custom_webhook' ? t('integrations', 'webhookUrl') : t('integrations', 'apiKey')}
            </Text>
            <TextInput
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={configValue}
              onChangeText={setConfigValue}
              placeholder={configModal?.provider === 'custom_webhook' ? 'https://...' : 'sk-...'}
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setConfigModal(null)}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }]} onPress={handleSaveConfig}>
                <Text style={s.modalSaveText}>{t('integrations', 'saveConfig')}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 0 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  tabRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: 14, fontWeight: '500' },
  card: { borderRadius: 12, marginBottom: 10, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600' },
  cardDesc: { fontSize: 12, marginTop: 1 },
  cardSync: { fontSize: 11, marginTop: 2 },
  cardStatus: { alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: '500' },
  availCard: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  availIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  availName: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  availDesc: { fontSize: 11, textAlign: 'center', marginTop: 2 },
  connectBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  connectBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 15, marginTop: 12, marginBottom: 4 },
  emptySub: { fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  modalCancelText: { fontSize: 16, fontWeight: '600' },
  modalSave: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12 },
  modalSaveText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});

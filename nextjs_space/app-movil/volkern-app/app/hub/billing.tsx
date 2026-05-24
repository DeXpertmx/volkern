import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  billingService, type SubscriptionPlan, type Invoice,
  type PaymentMethod, PLANS,
} from '../../src/services/billing';

const STATUS_ICONS: Record<string, string> = {
  paid: 'checkmark-circle',
  pending: 'time',
  overdue: 'alert-circle',
  failed: 'close-circle',
  refunded: 'refresh',
};

const STATUS_COLORS: Record<string, string> = {
  paid: '#10B981',
  pending: '#F59E0B',
  overdue: '#EF4444',
  failed: '#EF4444',
  refunded: '#8B5CF6',
};

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [subscription, setSubscription] = useState<SubscriptionPlan | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [planModal, setPlanModal] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [sub, invs, methods] = await Promise.all([
        billingService.getSubscription(),
        billingService.getInvoices(),
        billingService.getPaymentMethods(),
      ]);
      setSubscription(sub);
      setInvoices(invs);
      setPaymentMethods(methods);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleChangePlan = async (planId: string) => {
    try {
      await billingService.changePlan(planId);
      setPlanModal(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), '');
    }
  };

  const handleCancel = () => {
    Alert.alert(
      t('billing', 'cancelPlan'),
      t('billing', 'cancelConfirm'),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await billingService.cancelSubscription(); loadData(); },
        },
      ]
    );
  };

  const renderInvoice = ({ item }: { item: Invoice }) => (
    <View style={[s.invCard, { backgroundColor: colors.surface }]}>
      <View style={s.invRow}>
        <Ionicons name={STATUS_ICONS[item.status] as any} size={20} color={STATUS_COLORS[item.status]} />
        <View style={s.invInfo}>
          <Text style={[s.invNumber, { color: colors.textPrimary }]}>{t('billing', 'invoiceNumber', { n: item.number })}</Text>
          <Text style={[s.invDate, { color: colors.textSecondary }]}>{new Date(item.date).toLocaleDateString()}</Text>
        </View>
        <View style={s.invRight}>
          <Text style={[s.invAmount, { color: colors.textPrimary }]}>${item.amount.toFixed(2)}</Text>
          <View style={[s.invStatusBadge, { backgroundColor: STATUS_COLORS[item.status] + '15' }]}>
            <Text style={[s.invStatusText, { color: STATUS_COLORS[item.status] }]}>
              {t('billing', `status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const currentPlan = PLANS.find(p => p.id === subscription?.id) || PLANS[0];
  const planColor = subscription?.status === 'active' ? colors.primary : colors.textSecondary;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={invoices}
        keyExtractor={item => item.id}
        renderItem={renderInvoice}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>{t('billing', 'title')}</Text>
            </View>

            {/* Current Plan */}
            <View style={[s.planCard, { backgroundColor: colors.surface, borderColor: planColor + '30' }]}>
              <View style={s.planHeader}>
                <Ionicons name="diamond" size={24} color={planColor} />
                <View style={s.planInfo}>
                  <Text style={[s.planName, { color: colors.textPrimary }]}>
                    {subscription?.name || PLANS[0].name}
                  </Text>
                  {subscription?.currentPeriodEnd && (
                    <Text style={[s.planDate, { color: colors.textSecondary }]}>
                      {t('billing', 'nextBilling')}: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
              {subscription?.amount ? (
                <Text style={[s.planAmount, { color: colors.textPrimary }]}>
                  ${subscription.amount}/{subscription.interval === 'monthly' ? 'mo' : 'yr'}
                </Text>
              ) : (
                <Text style={[s.planFree, { color: colors.textSecondary }]}>Free</Text>
              )}
              <View style={s.planActions}>
                <TouchableOpacity style={[s.planBtn, { backgroundColor: colors.primary }]} onPress={() => setPlanModal(true)}>
                  <Text style={s.planBtnText}>{t('billing', 'changePlan')}</Text>
                </TouchableOpacity>
                {subscription?.status === 'active' && (
                  <TouchableOpacity style={[s.planBtnSecondary, { borderColor: colors.border }]} onPress={handleCancel}>
                    <Text style={[s.planBtnSecondaryText, { color: colors.textSecondary }]}>{t('billing', 'cancelPlan')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Payment Methods */}
            {paymentMethods.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('billing', 'paymentMethod')}</Text>
                {paymentMethods.map(method => (
                  <View key={method.id} style={[s.methodCard, { backgroundColor: colors.surface }]}>
                    <Ionicons name={method.type === 'card' ? 'card' : method.type === 'paypal' ? 'logo-usd' : 'business'} size={22} color={colors.textPrimary} />
                    <View style={s.methodInfo}>
                      <Text style={[s.methodName, { color: colors.textPrimary }]}>
                        {method.brand} {t('billing', 'cardEnding', { n: method.last4 })}
                      </Text>
                      <Text style={[s.methodExp, { color: colors.textSecondary }]}>
                        {t('billing', 'expiresAt', { date: `${method.expMonth}/${method.expYear}` })}
                      </Text>
                    </View>
                    {method.isDefault && (
                      <View style={[s.defaultBadge, { backgroundColor: colors.primaryBg }]}>
                        <Text style={[s.defaultText, { color: colors.primary }]}>Default</Text>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('billing', 'invoices')}</Text>
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('billing', 'noInvoices')}</Text>
          </View>
        }
      />

      {/* Plan Modal */}
      <Modal visible={planModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('billing', 'changePlan')}</Text>
              <TouchableOpacity onPress={() => setPlanModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {PLANS.map(plan => {
              const isCurrent = plan.id === subscription?.id;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[s.planOption, { backgroundColor: colors.surface, borderColor: isCurrent ? colors.primary : colors.border }]}
                  onPress={() => !isCurrent && handleChangePlan(plan.id)}
                  disabled={isCurrent}
                >
                  <View style={s.planOptionLeft}>
                    <Text style={[s.planOptionName, { color: colors.textPrimary }]}>{plan.name}</Text>
                    <Text style={[s.planOptionPrice, { color: colors.textPrimary }]}>
                      ${plan.amount}/{plan.interval === 'monthly' ? 'mo' : 'yr'}
                    </Text>
                  </View>
                  {isCurrent && (
                    <View style={[s.currentBadge, { backgroundColor: colors.primaryBg }]}>
                      <Text style={[s.currentText, { color: colors.primary }]}>Current</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
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
  planCard: { borderRadius: 16, padding: 20, borderWidth: 1.5, marginBottom: 20 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planInfo: { flex: 1 },
  planName: { fontSize: 20, fontWeight: '700' },
  planDate: { fontSize: 12, marginTop: 2 },
  planAmount: { fontSize: 28, fontWeight: '700', marginTop: 12 },
  planFree: { fontSize: 24, fontWeight: '600', marginTop: 12 },
  planActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  planBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  planBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  planBtnSecondary: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  planBtnSecondaryText: { fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, marginTop: 4 },
  methodCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 8 },
  methodInfo: { flex: 1 },
  methodName: { fontSize: 14, fontWeight: '500' },
  methodExp: { fontSize: 12, marginTop: 1 },
  defaultBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  defaultText: { fontSize: 11, fontWeight: '600' },
  invCard: { borderRadius: 12, marginBottom: 8, padding: 14 },
  invRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  invInfo: { flex: 1 },
  invNumber: { fontSize: 14, fontWeight: '500' },
  invDate: { fontSize: 12, marginTop: 1 },
  invRight: { alignItems: 'flex-end' },
  invAmount: { fontSize: 16, fontWeight: '700' },
  invStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 2 },
  invStatusText: { fontSize: 10, fontWeight: '600' },
  emptyText: { fontSize: 15, marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  planOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, borderWidth: 1.5, marginBottom: 10 },
  planOptionLeft: {},
  planOptionName: { fontSize: 16, fontWeight: '600' },
  planOptionPrice: { fontSize: 14, marginTop: 2 },
  currentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  currentText: { fontSize: 12, fontWeight: '600' },
});

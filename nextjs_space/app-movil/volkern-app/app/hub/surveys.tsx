import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { surveysService, type Survey, type SurveyQuestion, type Feedback, type QuestionType, type SurveyStatus } from '../../src/services/surveys';

// ─── Constants ────────────────────────────────────────────────────────────────
const QUESTION_TYPES: { key: QuestionType; labelKey: string }[] = [
  { key: 'rating', labelKey: 'typeRating' },
  { key: 'nps', labelKey: 'typeNps' },
  { key: 'multiple_choice', labelKey: 'typeMultipleChoice' },
  { key: 'single_choice', labelKey: 'typeSingleChoice' },
  { key: 'text', labelKey: 'typeText' },
  { key: 'yes_no', labelKey: 'typeYesNo' },
];

const FEEDBACK_TYPES: { key: Feedback['type']; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'general', labelKey: 'feedbackGeneral', icon: 'chatbubble-ellipses' },
  { key: 'bug', labelKey: 'feedbackBug', icon: 'bug' },
  { key: 'feature_request', labelKey: 'feedbackFeature', icon: 'bulb' },
  { key: 'satisfaction', labelKey: 'feedbackSatisfaction', icon: 'happy' },
];

type ViewMode = 'surveys' | 'feedback' | 'stats' | 'respond';

// ─── Rating Stars ─────────────────────────────────────────────────────────────
function RatingStars({ value, onChange, size = 32 }: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onChange?.(star)}
          disabled={!onChange}
        >
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={size}
            color={star <= value ? colors.warning : colors.textTertiary}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Survey Card ──────────────────────────────────────────────────────────────
function SurveyCard({ survey, colors, sty, onPress }: {
  survey: Survey;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const statusColor = survey.status === 'published' ? colors.success :
    survey.status === 'closed' ? colors.textTertiary : colors.warning;
  const statusLabel = survey.status === 'published' ? t('surveys', 'statusPublished') :
    survey.status === 'closed' ? t('surveys', 'statusClosed') : t('surveys', 'statusDraft');

  return (
    <TouchableOpacity
      style={[sty.surveyCard, { backgroundColor: colors.surface, borderLeftColor: statusColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={sty.surveyHeader}>
        <View style={sty.surveyInfo}>
          <Text style={[sty.surveyTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {survey.title}
          </Text>
          <Text style={[sty.surveyMeta, { color: colors.textTertiary }]} numberOfLines={1}>
            {survey.questions.length} pregunta(s) · {survey.responseCount} respuesta(s)
          </Text>
        </View>
        <View style={[sty.statusBadge, { backgroundColor: statusColor + '15' }]}>
          <Text style={[sty.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      {survey.description ? (
        <Text style={[sty.surveyDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {survey.description}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Feedback Card ────────────────────────────────────────────────────────────
function FeedbackCard({ feedback, colors, sty }: {
  feedback: Feedback;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  const typeInfo = FEEDBACK_TYPES.find((ft) => ft.key === feedback.type);
  const statusColor = feedback.status === 'resolved' ? colors.success :
    feedback.status === 'read' ? colors.primary : colors.warning;

  return (
    <View style={[sty.feedbackCard, { backgroundColor: colors.surface }]}>
      <View style={sty.feedbackHeader}>
        <View style={[sty.feedbackTypeIcon, { backgroundColor: (typeInfo?.icon ? colors.primaryBg : colors.background) }]}>
          <Ionicons name={(typeInfo?.icon as any) || 'chatbubble'} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sty.feedbackType, { color: colors.textPrimary }]}>
            {t('surveys', typeInfo?.labelKey || 'feedbackGeneral')}
          </Text>
          <Text style={[sty.feedbackDate, { color: colors.textTertiary }]}>
            {new Date(feedback.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={[sty.statusDot, { backgroundColor: statusColor }]} />
      </View>
      <Text style={[sty.feedbackMessage, { color: colors.textSecondary }]} numberOfLines={3}>
        {feedback.message}
      </Text>
      {feedback.rating ? (
        <RatingStars value={feedback.rating} size={18} />
      ) : null}
    </View>
  );
}

// ─── Stats View ───────────────────────────────────────────────────────────────
function SurveyStatsView({ survey, responses, colors, sty }: {
  survey: Survey;
  responses: { totalResponses: number; averageRating: number | null; questionBreakdown: { questionId: string; average: number | null; distribution: Record<string, number> }[] };
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[sty.statsTitle, { color: colors.textPrimary }]}>
        {t('surveys', 'stats')}
      </Text>
      <View style={[sty.statsRow, { backgroundColor: colors.surface }]}>
        <View style={sty.statItem}>
          <Text style={[sty.statNumber, { color: colors.primary }]}>{responses.totalResponses}</Text>
          <Text style={[sty.statLabel, { color: colors.textTertiary }]}>{t('surveys', 'responses')}</Text>
        </View>
        {responses.averageRating !== null && (
          <View style={sty.statItem}>
            <Text style={[sty.statNumber, { color: colors.warning }]}>{responses.averageRating}</Text>
            <Text style={[sty.statLabel, { color: colors.textTertiary }]}>{t('surveys', 'averageRating')}</Text>
          </View>
        )}
      </View>
      {survey.questions.map((q, idx) => {
        const breakdown = responses.questionBreakdown.find((b) => b.questionId === q.id);
        return (
          <View key={q.id} style={[sty.questionStatsCard, { backgroundColor: colors.surface }]}>
            <Text style={[sty.questionNum, { color: colors.textTertiary }]}>
              {t('surveys', 'questionTitle')} {idx + 1}
            </Text>
            <Text style={[sty.questionText, { color: colors.textPrimary }]}>{q.title}</Text>
            {q.type === 'rating' || q.type === 'nps' ? (
              <Text style={[sty.avgValue, { color: colors.primary }]}>
                {t('surveys', 'averageRating')}: {breakdown?.average ?? '—'}
              </Text>
            ) : null}
            {breakdown && Object.keys(breakdown.distribution).length > 0 && (
              <View style={{ marginTop: spacing.sm, gap: 4 }}>
                {Object.entries(breakdown.distribution).map(([key, count]) => (
                  <View key={key} style={sty.distRow}>
                    <Text style={[sty.distKey, { color: colors.textSecondary }]}>{key}</Text>
                    <View style={[sty.distBar, { backgroundColor: colors.borderLight }]}>
                      <View style={[sty.distFill, {
                        width: `${(count / responses.totalResponses) * 100}%`,
                        backgroundColor: colors.primary,
                      }]} />
                    </View>
                    <Text style={[sty.distCount, { color: colors.textTertiary }]}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SurveysScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();

  const [viewMode, setViewMode] = useState<ViewMode>('surveys');
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'published' | 'draft' | 'closed'>('all');

  // Survey modal
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [sTitle, setSTitle] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [sQuestions, setSQuestions] = useState<Omit<SurveyQuestion, 'id'>[]>([]);

  // Feedback modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fType, setFType] = useState<Feedback['type']>('general');
  const [fMessage, setFMessage] = useState('');
  const [fRating, setFRating] = useState(0);

  // Respond modal
  const [respondingSurvey, setRespondingSurvey] = useState<Survey | null>(null);
  const [responseAnswers, setResponseAnswers] = useState<Record<string, string | number>>({});

  // Stats
  const [statsData, setStatsData] = useState<{ survey: Survey; stats: { totalResponses: number; averageRating: number | null; questionBreakdown: any[] } } | null>(null);

  const [saving, setSaving] = useState(false);

  // ─── Load data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [allSurveys, allFeedback] = await Promise.all([
        surveysService.getAllSurveys(),
        surveysService.getAllFeedback(),
      ]);
      setSurveys(allSurveys);
      setFeedback(allFeedback);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ─── Filtered surveys ────────────────────────────────────────────────
  const filteredSurveys = useMemo(() => {
    if (activeTab === 'all') return surveys;
    return surveys.filter((s) => s.status === activeTab);
  }, [surveys, activeTab]);

  // ─── Open create survey ──────────────────────────────────────────────
  const openCreateSurvey = useCallback(() => {
    setEditingSurvey(null);
    setSTitle('');
    setSDesc('');
    setSQuestions([]);
    setShowSurveyModal(true);
  }, []);

  // ─── Open edit survey ────────────────────────────────────────────────
  const openEditSurvey = useCallback((survey: Survey) => {
    setEditingSurvey(survey);
    setSTitle(survey.title);
    setSDesc(survey.description);
    setSQuestions(survey.questions.map(({ id, ...rest }) => rest));
    setShowSurveyModal(true);
  }, []);

  // ─── Add question ────────────────────────────────────────────────────
  const addQuestion = useCallback(() => {
    setSQuestions((prev) => [...prev, {
      type: 'text',
      title: '',
      required: false,
      options: undefined,
    }]);
  }, []);

  // ─── Update question ─────────────────────────────────────────────────
  const updateQuestion = useCallback((index: number, updates: Partial<Omit<SurveyQuestion, 'id'>>) => {
    setSQuestions((prev) => prev.map((q, i) => i === index ? { ...q, ...updates } : q));
  }, []);

  // ─── Remove question ─────────────────────────────────────────────────
  const removeQuestion = useCallback((index: number) => {
    setSQuestions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Save survey ─────────────────────────────────────────────────────
  const handleSaveSurvey = useCallback(async () => {
    if (!sTitle.trim()) {
      Alert.alert(t('common', 'error'), t('surveys', 'titleRequired'));
      return;
    }
    setSaving(true);
    try {
      if (editingSurvey) {
        await surveysService.updateSurvey(editingSurvey.id, {
          title: sTitle.trim(),
          description: sDesc.trim(),
          questions: sQuestions.map((q) => ({
            ...q,
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
          })),
        });
      } else {
        await surveysService.createSurvey({
          title: sTitle.trim(),
          description: sDesc.trim(),
          status: 'draft',
          questions: sQuestions.map((q) => ({
            ...q,
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
          })),
        });
      }
      setShowSurveyModal(false);
      await loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('common', 'errorOccurred'));
    } finally {
      setSaving(false);
    }
  }, [sTitle, sDesc, sQuestions, editingSurvey, t, loadData]);

  // ─── Publish survey ──────────────────────────────────────────────────
  const handlePublish = useCallback(async (survey: Survey) => {
    await surveysService.updateSurvey(survey.id, { status: 'published' });
    await loadData();
  }, [loadData]);

  // ─── Close survey ────────────────────────────────────────────────────
  const handleClose = useCallback(async (survey: Survey) => {
    Alert.alert(t('surveys', 'close'), t('common', 'confirmAction'), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('surveys', 'close'), onPress: async () => {
        await surveysService.updateSurvey(survey.id, { status: 'closed' });
        await loadData();
      }},
    ]);
  }, [t, loadData]);

  // ─── Delete survey ───────────────────────────────────────────────────
  const handleDeleteSurvey = useCallback((survey: Survey) => {
    Alert.alert(t('surveys', 'deleteConfirm'), '', [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => {
        await surveysService.deleteSurvey(survey.id);
        await loadData();
      }},
    ]);
  }, [t, loadData]);

  // ─── Open respond ────────────────────────────────────────────────────
  const openRespond = useCallback(async (survey: Survey) => {
    setRespondingSurvey(survey);
    setResponseAnswers({});
    setViewMode('respond');
  }, []);

  // ─── Submit response ─────────────────────────────────────────────────
  const handleSubmitResponse = useCallback(async () => {
    if (!respondingSurvey) return;
    const answers = respondingSurvey.questions.map((q) => ({
      questionId: q.id,
      value: responseAnswers[q.id] ?? '',
    }));
    await surveysService.submitResponse(respondingSurvey.id, answers);
    Alert.alert(t('common', 'done'), t('surveys', 'saveSuccess'));
    setViewMode('surveys');
    setRespondingSurvey(null);
    await loadData();
  }, [respondingSurvey, responseAnswers, t, loadData]);

  // ─── View stats ──────────────────────────────────────────────────────
  const handleViewStats = useCallback(async (survey: Survey) => {
    const stats = await surveysService.getResponseStats(survey.id);
    setStatsData({ survey, stats });
    setViewMode('stats');
  }, []);

  // ─── Submit feedback ─────────────────────────────────────────────────
  const handleSubmitFeedback = useCallback(async () => {
    if (!fMessage.trim()) return;
    setSaving(true);
    try {
      await surveysService.submitFeedback({
        type: fType,
        message: fMessage.trim(),
        rating: fRating || undefined,
      });
      Alert.alert(t('common', 'done'), t('surveys', 'feedbackSubmitSuccess'));
      setShowFeedbackModal(false);
      setFMessage('');
      setFRating(0);
      await loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('common', 'errorOccurred'));
    } finally {
      setSaving(false);
    }
  }, [fType, fMessage, fRating, t, loadData]);

  // ─── Styles ──────────────────────────────────────────────────────────
  const s = useMemo(() => makeStyles(colors), [colors]);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RNStatusBar barStyle={colors.textPrimary === '#0F172A' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.headerBack, { backgroundColor: colors.background }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {viewMode === 'stats' ? t('surveys', 'stats') :
             viewMode === 'respond' ? (respondingSurvey?.title || t('surveys', 'title')) :
             viewMode === 'feedback' ? t('surveys', 'feedback') :
             t('surveys', 'title')}
          </Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>
            {viewMode === 'stats' ? (statsData?.survey.title || '') :
             viewMode === 'feedback' ? t('surveys', 'feedback') :
             t('surveys', 'subtitle')}
          </Text>
        </View>
        {viewMode === 'surveys' && (
          <TouchableOpacity style={[s.addBtn, { backgroundColor: colors.primary }]} onPress={openCreateSurvey}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Mode Switcher ──────────────────────────────────────────────── */}
      {viewMode !== 'stats' && viewMode !== 'respond' && (
        <View style={[s.modeRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[s.modeTab, viewMode === 'surveys' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setViewMode('surveys')}
          >
            <Ionicons name="document-text" size={16} color={viewMode === 'surveys' ? colors.primary : colors.textTertiary} />
            <Text style={[s.modeTabText, { color: viewMode === 'surveys' ? colors.primary : colors.textTertiary }]}>
              {t('surveys', 'mySurveys')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeTab, { borderBottomColor: colors.primary, borderBottomWidth: viewMode === 'feedback' ? 2 : 0 }]}
            onPress={() => setViewMode('feedback')}
          >
            <Ionicons name="chatbubbles" size={16} color={viewMode === 'feedback' ? colors.primary : colors.textTertiary} />
            <Text style={[s.modeTabText, { color: viewMode === 'feedback' ? colors.primary : colors.textTertiary }]}>
              {t('surveys', 'feedback')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Feedback Button ────────────────────────────────────────────── */}
      {viewMode === 'feedback' && (
        <View style={{ paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md }}>
          <TouchableOpacity
            style={[s.feedbackCta, { backgroundColor: colors.primary }]}
            onPress={() => setShowFeedbackModal(true)}
          >
            <Ionicons name="add-circle" size={20} color={colors.white} />
            <Text style={s.feedbackCtaText}>{t('surveys', 'submitFeedback')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ─── Surveys Mode ─────────────────────────────────────────────── */}
        {viewMode === 'surveys' && (
          <>
            {/* Filter tabs */}
            <View style={s.filterRow}>
              {(['all', 'published', 'draft', 'closed'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[s.filterTab, activeTab === tab && { backgroundColor: colors.primary }]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[s.filterText, { color: activeTab === tab ? colors.white : colors.textSecondary }]}>
                    {tab === 'all' ? t('common', 'all') :
                     tab === 'published' ? t('surveys', 'statusPublished') :
                     tab === 'draft' ? t('surveys', 'statusDraft') : t('surveys', 'statusClosed')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <View style={s.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : filteredSurveys.length === 0 ? (
              <View style={s.emptyState}>
                <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="document-text-outline" size={40} color={colors.primary} />
                </View>
                <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>{t('surveys', 'noSurveys')}</Text>
                <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('surveys', 'noSurveysSub')}</Text>
                <TouchableOpacity style={[s.createBtn, { backgroundColor: colors.primary }]} onPress={openCreateSurvey}>
                  <Ionicons name="add" size={18} color={colors.white} />
                  <Text style={s.createBtnText}>{t('surveys', 'newSurvey')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {filteredSurveys.map((survey) => (
                  <View key={survey.id}>
                    <SurveyCard survey={survey} colors={colors} sty={s} onPress={() => openEditSurvey(survey)} />
                    {/* Quick actions */}
                    <View style={s.surveyActions}>
                      {survey.status === 'draft' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: colors.successBg }]}
                          onPress={() => handlePublish(survey)}
                        >
                          <Ionicons name="paper-plane" size={14} color={colors.success} />
                          <Text style={[s.actionBtnText, { color: colors.success }]}>{t('surveys', 'publish')}</Text>
                        </TouchableOpacity>
                      )}
                      {survey.status === 'published' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: colors.warningBg }]}
                          onPress={() => handleClose(survey)}
                        >
                          <Ionicons name="close-circle" size={14} color={colors.warning} />
                          <Text style={[s.actionBtnText, { color: colors.warning }]}>{t('surveys', 'close')}</Text>
                        </TouchableOpacity>
                      )}
                      {survey.status !== 'draft' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: colors.primaryBg }]}
                          onPress={() => openRespond(survey)}
                        >
                          <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
                          <Text style={[s.actionBtnText, { color: colors.primary }]}>{t('surveys', 'response')}</Text>
                        </TouchableOpacity>
                      )}
                      {survey.responseCount > 0 && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: colors.infoBg }]}
                          onPress={() => handleViewStats(survey)}
                        >
                          <Ionicons name="stats-chart" size={14} color={colors.info} />
                          <Text style={[s.actionBtnText, { color: colors.info }]}>{t('surveys', 'viewStats')}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.errorBg }]}
                        onPress={() => handleDeleteSurvey(survey)}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.error} />
                        <Text style={[s.actionBtnText, { color: colors.error }]}>{t('common', 'delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ─── Feedback Mode ────────────────────────────────────────────── */}
        {viewMode === 'feedback' && (
          <>
            {loading ? (
              <View style={s.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : feedback.length === 0 ? (
              <View style={s.emptyState}>
                <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="chatbubbles-outline" size={40} color={colors.primary} />
                </View>
                <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>{t('surveys', 'noFeedback')}</Text>
                <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('surveys', 'noFeedbackSub')}</Text>
              </View>
            ) : (
              feedback.map((fb) => (
                <FeedbackCard key={fb.id} feedback={fb} colors={colors} sty={s} />
              ))
            )}
          </>
        )}

        {/* ─── Stats Mode ──────────────────────────────────────────────── */}
        {viewMode === 'stats' && statsData && (
          <SurveyStatsView
            survey={statsData.survey}
            responses={statsData.stats}
            colors={colors}
            sty={s}
          />
        )}

        {/* ─── Respond Mode ────────────────────────────────────────────── */}
        {viewMode === 'respond' && respondingSurvey && (
          <View style={{ gap: spacing.md }}>
            <Text style={[s.respondTitle, { color: colors.textPrimary }]}>{respondingSurvey.title}</Text>
            {respondingSurvey.description ? (
              <Text style={[s.respondDesc, { color: colors.textSecondary }]}>{respondingSurvey.description}</Text>
            ) : null}
            {respondingSurvey.questions.map((q, idx) => (
              <View key={q.id} style={[s.questionCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.respondQuestionText, { color: colors.textPrimary }]}>
                  {idx + 1}. {q.title}
                  {q.required ? <Text style={{ color: colors.error }}> *</Text> : null}
                </Text>

                {/* Rating */}
                {(q.type === 'rating') && (
                  <RatingStars
                    value={(responseAnswers[q.id] as number) || 0}
                    onChange={(v) => setResponseAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  />
                )}

                {/* NPS */}
                {q.type === 'nps' && (
                  <View style={s.npsRow}>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <TouchableOpacity
                        key={n}
                        style={[s.npsBtn, {
                          backgroundColor: responseAnswers[q.id] === n ? colors.primary : colors.background,
                          borderColor: responseAnswers[q.id] === n ? colors.primary : colors.border,
                        }]}
                        onPress={() => setResponseAnswers((prev) => ({ ...prev, [q.id]: n }))}
                      >
                        <Text style={[s.npsBtnText, {
                          color: responseAnswers[q.id] === n ? colors.white : colors.textSecondary,
                        }]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Multiple choice */}
                {(q.type === 'multiple_choice' || q.type === 'single_choice') && q.options && (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    {q.options.map((opt, oi) => (
                      <TouchableOpacity
                        key={oi}
                        style={[s.choiceOption, {
                          backgroundColor: responseAnswers[q.id] === opt ? colors.primaryBg : colors.background,
                          borderColor: responseAnswers[q.id] === opt ? colors.primary : colors.border,
                        }]}
                        onPress={() => setResponseAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      >
                        <Ionicons
                          name={q.type === 'multiple_choice'
                            ? (responseAnswers[q.id] === opt ? 'checkbox' : 'square-outline')
                            : (responseAnswers[q.id] === opt ? 'radio-button-on' : 'radio-button-off')}
                          size={18}
                          color={responseAnswers[q.id] === opt ? colors.primary : colors.textTertiary}
                        />
                        <Text style={[s.choiceText, { color: colors.textSecondary }]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Yes/No */}
                {q.type === 'yes_no' && (
                  <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
                    {['Sí', 'No'].map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[s.choiceOption, {
                          backgroundColor: responseAnswers[q.id] === opt ? colors.primaryBg : colors.background,
                          borderColor: responseAnswers[q.id] === opt ? colors.primary : colors.border,
                          flex: 1,
                        }]}
                        onPress={() => setResponseAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      >
                        <Text style={[s.choiceText, { color: responseAnswers[q.id] === opt ? colors.primary : colors.textSecondary, textAlign: 'center' }]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Text */}
                {q.type === 'text' && (
                  <TextInput
                    style={[s.textInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                    value={(responseAnswers[q.id] as string) || ''}
                    onChangeText={(v) => setResponseAnswers((prev) => ({ ...prev, [q.id]: v }))}
                    placeholder={t('surveys', 'feedbackPlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    multiline
                  />
                )}
              </View>
            ))}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleSubmitResponse}
            >
              <Text style={s.submitBtnText}>{t('surveys', 'submitFeedback')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ─── Create / Edit Survey Modal ─────────────────────────────────── */}
      <Modal visible={showSurveyModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingSurvey ? t('surveys', 'editSurvey') : t('surveys', 'newSurvey')}
              </Text>
              <TouchableOpacity onPress={() => setShowSurveyModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('surveys', 'surveyTitle')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={sTitle}
                onChangeText={setSTitle}
                placeholder={t('surveys', 'titlePlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('surveys', 'surveyDescription')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, minHeight: 60 }]}
                value={sDesc}
                onChangeText={setSDesc}
                placeholder={t('surveys', 'descPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={2}
              />

              {/* Questions */}
              <View style={s.questionsSection}>
                <Text style={[s.sectionLabel, { color: colors.textPrimary }]}>{t('surveys', 'addQuestion')}</Text>
                {sQuestions.map((q, idx) => (
                  <View key={idx} style={[s.questionEditor, { backgroundColor: colors.background }]}>
                    <View style={s.questionEditorHeader}>
                      <Text style={[s.qNum, { color: colors.textTertiary }]}>#{idx + 1}</Text>
                      <TouchableOpacity onPress={() => removeQuestion(idx)}>
                        <Ionicons name="close-circle" size={20} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={[s.fieldInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                      value={q.title}
                      onChangeText={(v) => updateQuestion(idx, { title: v })}
                      placeholder={t('surveys', 'questionTitle')}
                      placeholderTextColor={colors.textTertiary}
                    />
                    <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('surveys', 'questionType')}</Text>
                    <View style={s.typeGrid}>
                      {QUESTION_TYPES.map((qt) => (
                        <TouchableOpacity
                          key={qt.key}
                          style={[s.typeChip, {
                            backgroundColor: q.type === qt.key ? colors.primaryBg : colors.surface,
                            borderColor: q.type === qt.key ? colors.primary : colors.border,
                          }]}
                          onPress={() => {
                            const updates: Partial<Omit<SurveyQuestion, 'id'>> = { type: qt.key };
                            if (qt.key === 'multiple_choice' || qt.key === 'single_choice') {
                              updates.options = ['Opción 1', 'Opción 2'];
                            } else {
                              updates.options = undefined;
                            }
                            updateQuestion(idx, updates);
                          }}
                        >
                          <Text style={[s.typeChipText, { color: q.type === qt.key ? colors.primary : colors.textSecondary, fontSize: 10 }]}>
                            {t('surveys', qt.labelKey)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {(q.type === 'multiple_choice' || q.type === 'single_choice') && q.options && (
                      <>
                        {q.options.map((opt, oi) => (
                          <View key={oi} style={s.optionRow}>
                            <TextInput
                              style={[s.optionInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                              value={opt}
                              onChangeText={(v) => {
                                const newOpts = [...(q.options || [])];
                                newOpts[oi] = v;
                                updateQuestion(idx, { options: newOpts });
                              }}
                              placeholder={t('surveys', 'optionPlaceholder', { n: oi + 1 })}
                              placeholderTextColor={colors.textTertiary}
                            />
                            <TouchableOpacity
                              onPress={() => {
                                const newOpts = q.options?.filter((_, i) => i !== oi);
                                updateQuestion(idx, { options: newOpts });
                              }}
                            >
                              <Ionicons name="remove-circle" size={20} color={colors.error} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity
                          style={s.addOptionBtn}
                          onPress={() => {
                            const newOpts = [...(q.options || []), `Opción ${(q.options?.length || 0) + 1}`];
                            updateQuestion(idx, { options: newOpts });
                          }}
                        >
                          <Ionicons name="add-circle" size={18} color={colors.primary} />
                          <Text style={[s.addOptionText, { color: colors.primary }]}>{t('surveys', 'addOption')}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity
                      style={s.requiredToggle}
                      onPress={() => updateQuestion(idx, { required: !q.required })}
                    >
                      <Ionicons
                        name={q.required ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={q.required ? colors.primary : colors.textTertiary}
                      />
                      <Text style={[s.requiredText, { color: colors.textSecondary }]}>{t('surveys', 'required')}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[s.addQuestionBtn, { borderColor: colors.primary + '30' }]} onPress={addQuestion}>
                  <Ionicons name="add" size={20} color={colors.primary} />
                  <Text style={[s.addQuestionText, { color: colors.primary }]}>{t('surveys', 'addQuestion')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setShowSurveyModal(false)}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]} onPress={handleSaveSurvey} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalSaveText}>{t('common', 'save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Submit Feedback Modal ──────────────────────────────────────── */}
      <Modal visible={showFeedbackModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.feedbackModalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{t('surveys', 'submitFeedback')}</Text>
              <TouchableOpacity onPress={() => setShowFeedbackModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('surveys', 'feedbackType')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
              {FEEDBACK_TYPES.map((ft) => (
                <TouchableOpacity
                  key={ft.key}
                  style={[s.feedbackTypeChip, {
                    backgroundColor: fType === ft.key ? colors.primaryBg : colors.background,
                    borderColor: fType === ft.key ? colors.primary : colors.border,
                  }]}
                  onPress={() => setFType(ft.key)}
                >
                  <Ionicons name={ft.icon} size={16} color={fType === ft.key ? colors.primary : colors.textSecondary} />
                  <Text style={[s.feedbackTypeText, { color: fType === ft.key ? colors.primary : colors.textSecondary }]}>
                    {t('surveys', ft.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('surveys', 'feedbackRating')}</Text>
            <RatingStars value={fRating} onChange={setFRating} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary, marginTop: spacing.md }]}>{t('surveys', 'feedbackMessage')}</Text>
            <TextInput
              style={[s.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              value={fMessage}
              onChangeText={setFMessage}
              placeholder={t('surveys', 'feedbackPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setShowFeedbackModal(false)}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]} onPress={handleSubmitFeedback} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalSaveText}>{t('surveys', 'submitFeedback')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: Platform.OS === 'ios' ? 60 : (RNStatusBar.currentHeight || 24) + 8,
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
    },
    headerBack: {
      width: 40, height: 40, borderRadius: radius.md,
      justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { ...typography.h2 },
    headerSub: { ...typography.bodySmall, marginTop: 1 },
    addBtn: {
      width: 40, height: 40, borderRadius: radius.md,
      justifyContent: 'center', alignItems: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: 100,
    },
    loadingContainer: { paddingVertical: spacing.xxxl * 2, alignItems: 'center' },

    // ─── Mode Switcher ──────────────────────────────────────────────────
    modeRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
    },
    modeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
    },
    modeTabText: { ...typography.caption, fontWeight: '600' },

    // ─── Survey Card ────────────────────────────────────────────────────
    surveyCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderLeftWidth: 4,
      ...shadows.sm,
      marginBottom: spacing.sm,
    },
    surveyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    surveyInfo: { flex: 1 },
    surveyTitle: { ...typography.bodySmall, fontWeight: '600' },
    surveyMeta: { ...typography.caption, marginTop: 2 },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    statusText: { fontSize: 10, fontWeight: '600' },
    surveyDesc: { ...typography.bodySmall, marginTop: spacing.sm, lineHeight: 18 },
    surveyActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.md,
      marginLeft: spacing.sm,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
    },
    actionBtnText: { fontSize: 10, fontWeight: '600' },

    // ─── Feedback Card ──────────────────────────────────────────────────
    feedbackCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.sm,
    },
    feedbackHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    feedbackTypeIcon: {
      width: 36, height: 36, borderRadius: radius.md,
      justifyContent: 'center', alignItems: 'center',
    },
    feedbackType: { ...typography.bodySmall, fontWeight: '600' },
    feedbackDate: { ...typography.caption, marginTop: 1 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    feedbackMessage: { ...typography.bodySmall, lineHeight: 20 },

    // ─── Stats ──────────────────────────────────────────────────────────
    statsTitle: { ...typography.h3, marginBottom: spacing.sm },
    statsRow: {
      flexDirection: 'row',
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xl,
      marginBottom: spacing.md,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statNumber: { fontSize: 28, fontWeight: '700' },
    statLabel: { ...typography.caption, marginTop: 2 },
    questionStatsCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.sm,
    },
    questionNum: { ...typography.caption },
    questionText: { ...typography.bodySmall, fontWeight: '500', marginTop: 4 },
    avgValue: { ...typography.bodySmall, fontWeight: '600', marginTop: spacing.sm },
    distRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    distKey: { ...typography.caption, width: 60 },
    distBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
    distFill: { height: '100%', borderRadius: 4 },
    distCount: { ...typography.caption, width: 30, textAlign: 'right' },

    // ─── Respond ────────────────────────────────────────────────────────
    respondTitle: { ...typography.h3 },
    respondDesc: { ...typography.bodySmall, lineHeight: 20 },
    questionCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
    },
    respondQuestionText: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.md },
    npsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      justifyContent: 'center',
    },
    npsBtn: {
      width: 30,
      height: 30,
      borderRadius: radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
    },
    npsBtnText: { fontSize: 12, fontWeight: '600' },
    choiceOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    choiceText: { ...typography.bodySmall },
    textInput: {
      borderRadius: radius.md,
      padding: spacing.md,
      ...typography.body,
      borderWidth: 1,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    submitBtn: {
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
    },
    submitBtnText: { color: '#fff', ...typography.body, fontWeight: '600' },

    // ─── Feedback CTA ───────────────────────────────────────────────────
    feedbackCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
    },
    feedbackCtaText: { color: '#fff', ...typography.body, fontWeight: '600' },

    // ─── Filter Tabs ───────────────────────────────────────────────────
    filterRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    filterTab: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
    },
    filterText: { fontSize: 12, lineHeight: 16, fontWeight: '500' },

    createBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    // ─── Empty State ────────────────────────────────────────────────────
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl * 2,
      paddingHorizontal: spacing.xl,
    },
    emptyIcon: {
      width: 80, height: 80, borderRadius: radius.full,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { ...typography.h3, textAlign: 'center' },
    emptySub: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.xl,
    },
    // ─── Survey Editor ─────────────────────────────────────────────────
    questionsSection: { marginTop: spacing.lg },
    sectionLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.md },
    questionEditor: {
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    questionEditorHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    qNum: { ...typography.caption, fontWeight: '600' },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    typeChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    typeChipText: { fontWeight: '500' },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    optionInput: {
      flex: 1,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      ...typography.caption,
      borderWidth: 1,
    },
    addOptionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    addOptionText: { ...typography.caption, fontWeight: '500' },
    requiredToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    requiredText: { ...typography.caption },
    addQuestionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
    },
    addQuestionText: { ...typography.bodySmall, fontWeight: '500' },

    // ─── Modal ─────────────────────────────────────────────────────────
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalContent: {
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: layout.screenPadding,
      paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    modalTitle: { ...typography.h3 },
    fieldLabel: {
      ...typography.caption,
      fontWeight: '600',
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    fieldInput: {
      borderRadius: radius.md,
      padding: spacing.md,
      ...typography.body,
      borderWidth: 1,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    modalCancel: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      marginTop: spacing.md,
    },
    modalCancelText: { ...typography.body, fontWeight: '600' },
    modalSave: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.md,
    },
    modalSaveText: { ...typography.body, color: '#fff', fontWeight: '600' },

    // ─── Feedback Modal ────────────────────────────────────────────────
    feedbackModalContent: {
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: layout.screenPadding,
      paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
    },
    feedbackTypeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    feedbackTypeText: { ...typography.caption, fontWeight: '500' },
    feedbackInput: {
      borderRadius: radius.md,
      padding: spacing.md,
      ...typography.body,
      borderWidth: 1,
      minHeight: 100,
      textAlignVertical: 'top',
    },
  });

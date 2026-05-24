import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  calendarService,
  type CalendarEvent,
  type EventType,
  EVENT_TYPES,
  getEventTypeConfig,
  getDaysInMonth,
  getFirstDayOfMonth,
  formatDateKey,
  formatTime,
  getEventsForDate,
  isToday,
  isPastDate,
} from '../../src/services/calendar';
import { taskService, type Task } from '../../src/services/tasks';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - layout.screenPadding * 2) / 7);

// ─── Mini Event Dot ──────────────────────────────────────────────────────────
function EventDot({ type, colors }: { type: EventType; colors: ReturnType<typeof useThemeColors> }) {
  const color = getEventTypeConfig(type).color;
  return <View style={[sty.dot, { backgroundColor: color }]} />;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const colors = useThemeColors();
  const { t, locale, tArray } = useI18n();
  const dateLocale = locale === 'en-US' ? 'en-US' : 'es-MX';
  const s = useMemo(() => makeStyles(colors), [colors]);

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<EventType | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<EventType>('meeting');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formAllDay, setFormAllDay] = useState(false);
  const [formLocation, setFormLocation] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Derived values ─────────────────────────────────────────────────────
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Tasks mapped to events format
  const taskEvents = useMemo((): CalendarEvent[] => {
    return tasks
      .filter(t => t.dueDate && t.status !== 'completed' && t.status !== 'cancelled')
      .map(t => ({
        id: `task-${t.id}`,
        title: t.title,
        description: t.description || '',
        type: 'task' as EventType,
        date: t.dueDate!.split('T')[0],
        startTime: '',
        endTime: '',
        allDay: true,
        location: null,
        participants: [],
        relatedTaskId: t.id,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
  }, [tasks]);

  const allEvents = useMemo(() => [...events, ...taskEvents], [events, taskEvents]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (typeFilter === 'all') return allEvents;
    return allEvents.filter(e => e.type === typeFilter);
  }, [allEvents, typeFilter]);

  // Events for selected day
  const dayEvents = useMemo(() => {
    const dayEvts = getEventsForDate(filteredEvents, selectedDate);
    return dayEvts.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [filteredEvents, selectedDate]);

  // Events for each day of the month (for dots)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Set<EventType>>();
    filteredEvents.forEach(e => {
      if (!map.has(e.date)) map.set(e.date, new Set());
      map.get(e.date)!.add(e.type);
    });
    return map;
  }, [filteredEvents]);

  // ── Load ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const [eventsData, tasksData] = await Promise.all([
        calendarService.getEvents({ dateFrom: monthStart, dateTo: monthEnd }).catch(() => []),
        taskService.getAll().catch(() => [] as Task[]),
      ]);
      setEvents(eventsData);
      setTasks(tasksData);
    } catch (err: any) {
      setError(err?.message || t('common', 'error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, month, daysInMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const goToPrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(formatDateKey(today));
  };

  // ── Create / Edit ──────────────────────────────────────────────────────
  const openCreate = (date?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDescription('');
    setFormType('meeting');
    setFormDate(date || selectedDate);
    setFormStartTime('');
    setFormEndTime('');
    setFormAllDay(false);
    setFormLocation('');
    setShowModal(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDescription(event.description);
    setFormType(event.type);
    setFormDate(event.date);
    setFormStartTime(event.startTime);
    setFormEndTime(event.endTime);
    setFormAllDay(event.allDay);
    setFormLocation(event.location || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      Alert.alert(t('common', 'error'), t('calendar', 'titleRequired'));
      return;
    }
    if (!formDate.trim()) {
      Alert.alert(t('common', 'error'), t('calendar', 'dateRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editingEvent) {
        await calendarService.update(editingEvent.id, {
          title: formTitle.trim(),
          description: formDescription.trim(),
          type: formType,
          date: formDate,
          startTime: formAllDay ? '' : formStartTime,
          endTime: formAllDay ? '' : formEndTime,
          allDay: formAllDay,
          location: formLocation.trim() || null,
        });
      } else {
        const input = {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          type: formType,
          date: formDate,
          startTime: formAllDay ? '' : formStartTime || undefined,
          endTime: formAllDay ? '' : formEndTime || undefined,
          allDay: formAllDay,
          location: formLocation.trim() || undefined,
        };
        await calendarService.create(input);
      }
      setShowModal(false);
      loadData(true);
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('calendar', 'saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = (event: CalendarEvent) => {
    if (event.relatedTaskId) {
      Alert.alert(t('common', 'info'), t('calendar', 'taskLinked'));
      return;
    }
    Alert.alert(
      t('calendar', 'deleteEvent'),
      t('calendar', 'deleteEventConfirm', { title: event.title }),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await calendarService.delete(event.id);
              setEvents(prev => prev.filter(e => e.id !== event.id));
            } catch (e: any) {
              Alert.alert(t('common', 'error'), e.message || t('calendar', 'deleteError'));
            }
          },
        },
      ],
    );
  };

  // ── Build calendar grid ───────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    // Pad to complete last row
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    return days;
  }, [firstDay, daysInMonth]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('calendar', 'title')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('calendar', 'title')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Ionicons name="cloud-offline" size={48} color={colors.error} />
          <Text style={[s.subtitle, { color: colors.error, textAlign: 'center', marginTop: spacing.md }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[s.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => loadData()}
          >
            <Text style={[s.retryText, { color: colors.white }]}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const selectedEventsCount = dayEvents.length;
  const totalEventsCount = allEvents.length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('calendar', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textTertiary }]}>
            {totalEventsCount > 0 ? t('calendar', 'eventsThisMonth', { n: totalEventsCount }) : t('calendar', 'noEvents')}
          </Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={[s.headerBtn, { backgroundColor: colors.background }]}
            onPress={goToToday}
          >
            <Text style={[s.headerBtnText, { color: colors.primary }]}>{t('calendar', 'today')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.addButton, { backgroundColor: colors.primary }]} onPress={() => openCreate()}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.primary} />
        }
      >
        {/* ─── Month Navigator ───────────────────────────────────── */}
        <View style={[s.monthNav, { backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={goToPrevMonth} style={s.navArrow}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday}>
            <Text style={[s.monthTitle, { color: colors.textPrimary }]}>
              {tArray('calendar', 'monthNames')[month]} {year}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToNextMonth} style={s.navArrow}>
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ─── Day Headers ───────────────────────────────────────── */}
        <View style={[s.dayHeaders, { backgroundColor: colors.surface }]}>
          {tArray('calendar', 'dayNames').map((name, i) => (
            <View key={i} style={s.dayHeaderCell}>
              <Text style={[s.dayHeaderText, { color: colors.textTertiary }]}>{name}</Text>
            </View>
          ))}
        </View>

        {/* ─── Calendar Grid ─────────────────────────────────────── */}
        <View style={[s.calendarGrid, { backgroundColor: colors.surface }]}>
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <View key={`empty-${index}`} style={s.dayCell} />;
            }

            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = dateKey === selectedDate;
            const today = isToday(dateKey);
            const past = isPastDate(dateKey);
            const dayEventTypes = eventsByDate.get(dateKey);

            return (
              <TouchableOpacity
                key={dateKey}
                style={[
                  s.dayCell,
                  isSelected && { backgroundColor: colors.primary + '15' },
                ]}
                onPress={() => setSelectedDate(dateKey)}
                onLongPress={() => openCreate(dateKey)}
              >
                <View style={[
                  s.dayNumberCircle,
                  today && { backgroundColor: colors.primary },
                  isSelected && !today && { backgroundColor: colors.primary + '25', borderWidth: 1, borderColor: colors.primary },
                ]}>
                  <Text style={[
                    s.dayNumber,
                    { color: colors.textPrimary },
                    today && { color: colors.white, fontWeight: '700' },
                    past && { color: colors.textTertiary },
                  ]}>
                    {day}
                  </Text>
                </View>
                {dayEventTypes && dayEventTypes.size > 0 && (
                  <View style={s.dayDots}>
                    {Array.from(dayEventTypes).slice(0, 3).map((type, i) => (
                      <EventDot key={i} type={type} colors={colors} />
                    ))}
                    {dayEventTypes.size > 3 && (
                      <Text style={[sty.dotMore, { color: colors.textTertiary }]}>+{dayEventTypes.size - 3}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── Filter Toggle ─────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.filterToggle, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <View style={s.filterToggleLeft}>
            <Ionicons name="funnel" size={16} color={colors.textSecondary} />
            <Text style={[s.filterToggleText, { color: colors.textSecondary }]}>
              {typeFilter === 'all' ? t('calendar', 'filterAll') : t('calendar', typeFilter)}
            </Text>
          </View>
          <Ionicons
            name={showFilters ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textTertiary}
          />
        </TouchableOpacity>

        {showFilters && (
          <View style={[s.filterRow, { backgroundColor: colors.surface }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  s.filterChip,
                  { backgroundColor: colors.background },
                  typeFilter === 'all' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setTypeFilter('all')}
              >
                <Text style={[
                  s.filterChipText,
                  { color: colors.textSecondary },
                  typeFilter === 'all' && { color: colors.white, fontWeight: '600' },
                ]}>
                  {t('calendar', 'filterAll')}
                </Text>
              </TouchableOpacity>
              {EVENT_TYPES.map(et => (
                <TouchableOpacity
                  key={et.value}
                  style={[
                    s.filterChip,
                    { backgroundColor: colors.background },
                    typeFilter === et.value && { backgroundColor: et.color },
                  ]}
                  onPress={() => setTypeFilter(et.value)}
                >
                  <Ionicons name={et.icon as any} size={14} color={typeFilter === et.value ? colors.white : et.color} />
                  <Text style={[
                    s.filterChipText,
                    { color: colors.textSecondary },
                    typeFilter === et.value && { color: colors.white, fontWeight: '600' },
                  ]}>
                    {t('calendar', et.value)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ─── Selected Day Header ───────────────────────────────── */}
        <View style={[s.daySection, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={s.daySectionHeader}>
            <Text style={[s.daySectionTitle, { color: colors.textPrimary }]}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString(dateLocale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Text style={[s.daySectionCount, { color: colors.textTertiary }]}>
              {selectedEventsCount > 0 ? t('calendar', 'eventsCount', { n: selectedEventsCount }) : t('calendar', 'noEvents')}
            </Text>
          </View>
        </View>

        {/* ─── Events for Selected Day ───────────────────────────── */}
        {dayEvents.length === 0 ? (
          <View style={[s.empty, { backgroundColor: colors.surface }]}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="calendar-outline" size={32} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>{t('calendar', 'noEvents')}</Text>
            <Text style={[s.emptySub, { color: colors.textTertiary }]}>
              {t('calendar', 'noEventsSub')}
            </Text>
            <TouchableOpacity
              style={[s.emptyButton, { backgroundColor: colors.primary }]}
              onPress={() => openCreate()}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={[s.emptyButtonText, { color: colors.white }]}>{t('calendar', 'newEvent')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[s.eventList, { backgroundColor: colors.surface }]}>
            {dayEvents.map((event, index) => {
              const config = getEventTypeConfig(event.type);
              const isTask = !!event.relatedTaskId;

              return (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    s.eventCard,
                    { borderLeftColor: config.color, backgroundColor: colors.background },
                    index === dayEvents.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => !isTask && openEdit(event)}
                  onLongPress={() => handleDelete(event)}
                  activeOpacity={isTask ? 1 : 0.7}
                >
                  {/* Time column */}
                  <View style={s.eventTimeCol}>
                    {event.allDay ? (
                      <Text style={[s.eventAllDayText, { color: colors.primary }]}>{t('calendar', 'allDay')}</Text>
                    ) : (
                      <>
                        <Text style={[s.eventTime, { color: colors.textPrimary }]}>
                          {formatTime(event.startTime)}
                        </Text>
                        {event.endTime && (
                          <Text style={[s.eventTimeEnd, { color: colors.textTertiary }]}>
                            {formatTime(event.endTime)}
                          </Text>
                        )}
                      </>
                    )}
                  </View>

                  {/* Event content */}
                  <View style={s.eventContent}>
                    <View style={s.eventHeader}>
                      <Ionicons name={config.icon as any} size={14} color={config.color} />
                      <Text style={[s.eventTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {event.title}
                      </Text>
                      {isTask && (
                        <View style={[s.taskBadge, { backgroundColor: colors.warningBg }]}>
                          <Text style={[s.taskBadgeText, { color: colors.warning }]}>{t('calendar', 'task')}</Text>
                        </View>
                      )}
                    </View>
                    {event.description ? (
                      <Text style={[s.eventDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                        {event.description}
                      </Text>
                    ) : null}
                    {event.location ? (
                      <View style={s.eventMeta}>
                        <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                        <Text style={[s.eventMetaText, { color: colors.textTertiary }]} numberOfLines={1}>
                          {event.location}
                        </Text>
                      </View>
                    ) : null}
                    {event.participants.length > 0 && (
                      <View style={s.eventMeta}>
                        <Ionicons name="people-outline" size={12} color={colors.textTertiary} />
                        <Text style={[s.eventMetaText, { color: colors.textTertiary }]} numberOfLines={1}>
                          {event.participants.map(p => p.name).join(', ')}
                        </Text>
                      </View>
                    )}
                  </View>

                  {!isTask && (
                    <TouchableOpacity style={s.eventMore} onPress={() => handleDelete(event)}>
                      <Ionicons name="ellipsis-vertical" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ─── Create/Edit Modal ──────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingEvent ? t('calendar', 'editEvent') : t('calendar', 'newEvent')}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalScroll} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('calendar', 'eventTitle')} *</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder={t('calendar', 'eventTitlePlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Type */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('calendar', 'eventType')}</Text>
              <View style={s.typeRow}>
                {EVENT_TYPES.map(et => (
                  <TouchableOpacity
                    key={et.value}
                    style={[
                      s.typeOption,
                      { borderColor: colors.border },
                      formType === et.value && { borderColor: et.color, backgroundColor: et.color + '10' },
                    ]}
                    onPress={() => setFormType(et.value)}
                  >
                    <Ionicons name={et.icon as any} size={16} color={formType === et.value ? et.color : colors.textTertiary} />
                    <Text style={[
                      s.typeOptionText,
                      { color: formType === et.value ? et.color : colors.textSecondary },
                    ]}>
                      {t('calendar', et.value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('calendar', 'date')} *</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formDate}
                onChangeText={setFormDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
              />

              {/* All day toggle */}
              <TouchableOpacity
                style={[s.allDayToggle, { borderColor: colors.border }]}
                onPress={() => setFormAllDay(!formAllDay)}
              >
                <View style={[
                  s.checkbox,
                  formAllDay && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}>
                  {formAllDay && <Ionicons name="checkmark" size={14} color={colors.white} />}
                </View>
                <Text style={[s.allDayText, { color: colors.textPrimary }]}>{t('calendar', 'allDay')}</Text>
              </TouchableOpacity>

              {/* Start / End time */}
              {!formAllDay && (
                <View style={s.timeRow}>
                  <View style={s.timeField}>
                    <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('calendar', 'startTime')}</Text>
                    <TextInput
                      style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                      value={formStartTime}
                      onChangeText={setFormStartTime}
                      placeholder="HH:mm"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                  <View style={s.timeField}>
                    <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('calendar', 'endTime')}</Text>
                    <TextInput
                      style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                      value={formEndTime}
                      onChangeText={setFormEndTime}
                      placeholder="HH:mm"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                </View>
              )}

              {/* Location */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('calendar', 'location')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formLocation}
                onChangeText={setFormLocation}
                placeholder={t('calendar', 'locationPlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Description */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('calendar', 'description')}</Text>
              <TextInput
                style={[s.fieldInput, s.fieldTextArea, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder={t('calendar', 'descPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Actions */}
              <View style={s.modalActions}>
                <TouchableOpacity
                  style={[s.modalCancel, { borderColor: colors.border }]}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalSave, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={[s.modalSaveText, { color: colors.white }]}>
                      {editingEvent ? t('common', 'save') : t('common', 'create')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Static styles (reusable within this module) ──────────────────────────────
export const sty = {
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotMore: {
    fontSize: 8,
    fontWeight: '600' as const,
  },
  eventBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
};

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h2,
  },
  headerSub: {
    ...typography.caption,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  headerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  headerBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    ...typography.bodySmall,
  },
  retryButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryText: {
    ...typography.body,
    fontWeight: '600',
  },

  // ─── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },

  // ─── Month Navigator ─────────────────────────────────────────────────────────
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitle: {
    ...typography.h3,
    fontWeight: '700',
  },

  // ─── Day Headers ─────────────────────────────────────────────────────────────
  dayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xs,
  },
  dayHeaderCell: {
    width: DAY_SIZE,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayHeaderText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },

  // ─── Calendar Grid ──────────────────────────────────────────────────────────
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  dayCell: {
    width: DAY_SIZE,
    height: DAY_SIZE + 4,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 4,
  },
  dayNumberCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumber: {
    ...typography.bodySmall,
    fontSize: 13,
    fontWeight: '500',
  },
  dayDots: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
    alignItems: 'center',
    height: 10,
  },

  // ─── Filter ─────────────────────────────────────────────────────────────────
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterToggleText: {
    ...typography.bodySmall,
  },
  filterRow: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '500',
  },

  // ─── Day Section ────────────────────────────────────────────────────────────
  daySection: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
  },
  daySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daySectionTitle: {
    ...typography.h3,
    textTransform: 'capitalize',
  },
  daySectionCount: {
    ...typography.caption,
  },

  // ─── Empty ─────────────────────────────────────────────────────────────────
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  emptyButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },

  // ─── Event List ─────────────────────────────────────────────────────────────
  eventList: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
    gap: 0,
  },
  eventCard: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  eventTimeCol: {
    width: 65,
    alignItems: 'flex-end',
    paddingTop: 2,
  },
  eventTime: {
    ...typography.bodySmall,
    fontWeight: '600',
    fontSize: 13,
  },
  eventTimeEnd: {
    ...typography.caption,
    fontSize: 10,
    marginTop: 1,
  },
  eventAllDayText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 10,
  },
  eventContent: {
    flex: 1,
    gap: spacing.xs,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    flex: 1,
  },
  taskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  taskBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  eventDesc: {
    ...typography.caption,
    marginLeft: spacing.xl + spacing.sm,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: spacing.xl + spacing.sm,
  },
  eventMetaText: {
    ...typography.caption,
    fontSize: 11,
    flex: 1,
  },
  eventMore: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -4,
  },

  // ─── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
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
  modalTitle: {
    ...typography.h3,
  },
  modalScroll: {
    maxHeight: '90%',
  },
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
  fieldTextArea: {
    minHeight: 80,
    paddingTop: spacing.md,
  },

  // ─── Type selector ─────────────────────────────────────────────────────────
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  typeOptionText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // ─── All day toggle ────────────────────────────────────────────────────────
  allDayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allDayText: {
    ...typography.bodySmall,
    fontWeight: '500',
  },

  // ─── Time fields ───────────────────────────────────────────────────────────
  timeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  timeField: {
    flex: 1,
  },

  // ─── Modal actions ─────────────────────────────────────────────────────────
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modalCancelText: {
    ...typography.body,
    fontWeight: '600',
  },
  modalSave: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  modalSaveText: {
    ...typography.body,
    fontWeight: '600',
  },
});

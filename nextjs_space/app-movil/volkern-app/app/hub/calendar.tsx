import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, TextInput, RefreshControl, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { calendarService, CalendarEvent, CreateEventInput, UpdateEventInput, EventType, EVENT_TYPES, getEventsForDate, getDaysInMonth, getFirstDayOfMonth, formatDateKey, isToday, isPastDate, formatTime, getEventTypeColor, getEventTypeIcon } from '../../src/services/calendar';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = makeStyles(colors, insets);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [filterType, setFilterType] = useState<EventType | 'all'>('all');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<EventType>('meeting');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formAllDay, setFormAllDay] = useState(false);
  const [formDescription, setFormDescription] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const lastDay = getDaysInMonth(currentYear, currentMonth);
      const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${lastDay}`;
      const data = await calendarService.getEvents({
        dateFrom: monthStart,
        dateTo: monthEnd,
        type: filterType !== 'all' ? filterType : undefined,
      });
      setEvents(data);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth, filterType]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const changeMonth = (delta: number) => {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCurrentMonth(m);
    setCurrentYear(y);
  };

  const openNewEvent = (date?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormType('meeting');
    setFormDate(date || selectedDate);
    setFormStartTime('');
    setFormEndTime('');
    setFormLocation('');
    setFormAllDay(false);
    setFormDescription('');
    setModalVisible(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormType(event.type);
    setFormDate(event.date);
    setFormStartTime(event.startTime || '');
    setFormEndTime(event.endTime || '');
    setFormLocation(event.location || '');
    setFormAllDay(event.allDay);
    setFormDescription(event.description || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      Alert.alert(t('calendar', 'titleRequired'));
      return;
    }
    if (!formDate.trim()) {
      Alert.alert(t('calendar', 'dateRequired'));
      return;
    }
    try {
      if (editingEvent) {
        await calendarService.update(editingEvent.id, {
          title: formTitle.trim(),
          type: formType,
          date: formDate,
          startTime: formStartTime || undefined,
          endTime: formEndTime || undefined,
          location: formLocation.trim() || null,
          allDay: formAllDay,
          description: formDescription.trim() || undefined,
        });
      } else {
        await calendarService.create({
          title: formTitle.trim(),
          type: formType,
          date: formDate,
          startTime: formStartTime || undefined,
          endTime: formEndTime || undefined,
          location: formLocation.trim() || undefined,
          allDay: formAllDay,
          description: formDescription.trim() || undefined,
        });
      }
      setModalVisible(false);
      loadData();
    } catch (err) {
      Alert.alert(t('calendar', 'saveError'));
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    Alert.alert(
      t('calendar', 'deleteConfirm'),
      t('calendar', 'deleteEventConfirm', { title: editingEvent.title }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => {
            try {
              await calendarService.delete(editingEvent.id);
              setModalVisible(false);
              loadData();
            } catch { Alert.alert(t('calendar', 'deleteError')); }
          },
        },
      ]
    );
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const selectedEvents = getEventsForDate(events, selectedDate);
  const localeStr = (locale as string).startsWith('es') ? 'es-MX' : 'en-US';

  const renderCalendarGrid = () => {
    const cells: React.ReactNode[] = [];
    // Day names header
    const dayNames = localeStr === 'es-MX'
      ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      cells.push(
        <View key={`header-${i}`} style={s.dayHeader}>
          <Text style={s.dayHeaderText}>{dayNames[i]}</Text>
        </View>
      );
    }
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      cells.push(<View key={`empty-${i}`} style={s.dayCell} />);
    }
    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = getEventsForDate(events, dateKey);
      const today = isToday(dateKey);
      const past = isPastDate(dateKey);
      const selected = dateKey === selectedDate;
      cells.push(
        <TouchableOpacity
          key={dateKey}
          style={[
            s.dayCell,
            today && s.todayCell,
            selected && s.selectedCell,
          ]}
          onPress={() => setSelectedDate(dateKey)}
        >
          <Text style={[
            s.dayText,
            today && s.todayText,
            selected && s.selectedText,
            past && !today && s.pastDayText,
          ]}>{day}</Text>
          {dayEvents.length > 0 && (
            <View style={s.dotContainer}>
              {dayEvents.slice(0, 3).map((e, i) => (
                <View key={i} style={[s.dot, { backgroundColor: getEventTypeColor(e.type) }]} />
              ))}
            </View>
          )}
        </TouchableOpacity>
      );
    }
    return cells;
  };

  const renderEventCard = (event: CalendarEvent) => (
    <TouchableOpacity
      key={event.id}
      style={s.eventCard}
      onPress={() => openEditEvent(event)}
    >
      <View style={[s.eventColorBar, { backgroundColor: getEventTypeColor(event.type) }]} />
      <View style={s.eventContent}>
        <View style={s.eventHeader}>
          <Text style={s.eventTitle} numberOfLines={1}>{event.title}</Text>
          {event.allDay ? (
            <Text style={s.eventTime}>{t('calendar', 'allDay')}</Text>
          ) : (
            <Text style={s.eventTime}>
              {event.startTime ? formatTime(event.startTime) : ''}
              {event.endTime ? ` - ${formatTime(event.endTime)}` : ''}
            </Text>
          )}
        </View>
        {event.location && (
          <View style={s.eventMeta}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={s.eventMetaText} numberOfLines={1}>{event.location}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>{t('calendar', 'title')}</Text>
          <TouchableOpacity style={s.addButton} onPress={() => openNewEvent()}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Month navigation */}
        <View style={s.monthNav}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={s.monthNavBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.monthTitle}>
            {new Date(currentYear, currentMonth).toLocaleDateString(localeStr, { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={s.monthNavBtn}>
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Calendar grid */}
        <View style={s.calendarGrid}>
          {renderCalendarGrid()}
        </View>

        {/* Type filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          <TouchableOpacity
            style={[s.filterChip, filterType === 'all' && s.filterChipActive]}
            onPress={() => setFilterType('all')}
          >
            <Text style={[s.filterChipText, filterType === 'all' && s.filterChipTextActive]}>
              {t('calendar', 'filterAll')}
            </Text>
          </TouchableOpacity>
          {EVENT_TYPES.map(et => (
            <TouchableOpacity
              key={et.value}
              style={[s.filterChip, filterType === et.value && s.filterChipActive]}
              onPress={() => setFilterType(et.value)}
            >
              <Ionicons name={et.icon as any} size={14} color={filterType === et.value ? '#fff' : colors.textSecondary} />
              <Text style={[s.filterChipText, filterType === et.value && s.filterChipTextActive]}>
                {et.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Selected date label */}
        <Text style={s.sectionTitle}>
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString(localeStr, {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </Text>

        {/* Events for selected date */}
        {selectedEvents.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
            <Text style={s.emptyText}>{t('calendar', 'noEvents')}</Text>
            <TouchableOpacity style={s.emptyAction} onPress={() => openNewEvent(selectedDate)}>
              <Text style={s.emptyActionText}>{t('calendar', 'newEvent')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          selectedEvents.map(renderEventCard)
        )}

        {/* Events count */}
        {selectedEvents.length > 0 && (
          <Text style={s.eventsCount}>
            {t('calendar', 'eventsCount', { n: String(selectedEvents.length) })}
          </Text>
        )}
      </ScrollView>

      {/* Event editor modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={s.modalCancel}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>
                {editingEvent ? t('calendar', 'editEvent') : t('calendar', 'newEvent')}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={s.modalSave}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalBody}>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('calendar', 'eventTitlePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formTitle}
                onChangeText={setFormTitle}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.typeRow}>
                {EVENT_TYPES.map(et => (
                  <TouchableOpacity
                    key={et.value}
                    style={[s.typeChip, formType === et.value && { backgroundColor: et.color + '30', borderColor: et.color }]}
                    onPress={() => setFormType(et.value)}
                  >
                    <Ionicons name={et.icon as any} size={18} color={formType === et.value ? et.color : colors.textSecondary} />
                    <Text style={[s.typeChipText, { color: formType === et.value ? et.color : colors.textSecondary }]}>
                      {et.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
                value={formDate}
                onChangeText={setFormDate}
              />

              <View style={s.timeRow}>
                <TextInput
                  style={[s.timeInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder={t('calendar', 'startTime')}
                  placeholderTextColor={colors.textSecondary}
                  value={formStartTime}
                  onChangeText={setFormStartTime}
                />
                <Text style={s.timeSep}>-</Text>
                <TextInput
                  style={[s.timeInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder={t('calendar', 'endTime')}
                  placeholderTextColor={colors.textSecondary}
                  value={formEndTime}
                  onChangeText={setFormEndTime}
                />
              </View>

              <TouchableOpacity style={s.allDayRow} onPress={() => setFormAllDay(!formAllDay)}>
                <Ionicons
                  name={formAllDay ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={formAllDay ? colors.primary : colors.textSecondary}
                />
                <Text style={[s.allDayText, { color: colors.textPrimary }]}>{t('calendar', 'allDay')}</Text>
              </TouchableOpacity>

              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('calendar', 'locationPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formLocation}
                onChangeText={setFormLocation}
              />

              <TextInput
                style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('calendar', 'descPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
              />

              {editingEvent && (
                <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={s.deleteBtnText}>{t('calendar', 'deleteEvent')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SafeAreaView({ children, style, edges }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, paddingTop: edges?.includes('top') ? insets.top : 0 }, style]}>
      {children}
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: insets.bottom + 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNavBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  monthTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  dayHeader: { width: '14.28%', alignItems: 'center', paddingVertical: 6 },
  dayHeaderText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  todayCell: { backgroundColor: colors.primary + '20' },
  selectedCell: { backgroundColor: colors.primary },
  dayText: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  todayText: { color: colors.primary, fontWeight: '700' },
  selectedText: { color: '#fff', fontWeight: '700' },
  pastDayText: { color: colors.textSecondary, opacity: 0.5 },
  dotContainer: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  filterRow: { flexDirection: 'row', marginBottom: 16 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface, marginRight: 8, gap: 4 },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 13, color: colors.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 12, textTransform: 'capitalize' },
  eventCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  eventColorBar: { width: 4, height: '100%', position: 'absolute', left: 0, top: 0, bottom: 0 },
  eventContent: { flex: 1, padding: 12, paddingLeft: 16 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: 8 },
  eventTime: { fontSize: 12, color: colors.textSecondary },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventMetaText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12, marginBottom: 16 },
  emptyAction: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary },
  emptyActionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  eventsCount: { textAlign: 'center', fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  modalCancel: { fontSize: 16, color: colors.textSecondary },
  modalSave: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  modalBody: { padding: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  textArea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', marginBottom: 12 },
  typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, marginRight: 8, gap: 4 },
  typeChipText: { fontSize: 13, fontWeight: '500' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  timeInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  timeSep: { fontSize: 16, color: colors.textSecondary },
  allDayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  allDayText: { fontSize: 15 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 8, borderRadius: 12, backgroundColor: '#FEE2E2' },
  deleteBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
});

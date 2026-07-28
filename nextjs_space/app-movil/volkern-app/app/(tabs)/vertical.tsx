import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme'
import { useI18n } from '../../src/contexts/i18n'
import { useVertical } from '../../src/contexts/vertical'
import { hubsService } from '../../src/services/hubs'
import { getIonicon } from '../../src/utils/icons'
import VerticalPillTabs from '../../src/components/VerticalPillTabs'
import type { HubCategory, HubModule } from '../../src/types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GRID_COLS = 3
const CARD_SIZE = (SCREEN_WIDTH - layout.screenPadding * 2 - spacing.md * (GRID_COLS - 1)) / GRID_COLS

function VerticalCard({
  category,
  onPress,
  colors,
  styles: sty,
}: {
  category: HubCategory
  onPress: (cat: HubCategory) => void
  colors: ReturnType<typeof useThemeColors>
  styles: typeof styl
}) {
  return (
    <TouchableOpacity
      style={[sty.card, { borderTopColor: category.color }]}
      onPress={() => onPress(category)}
      activeOpacity={0.7}
    >
      <View style={[sty.iconWrap, { backgroundColor: category.color + '15' }]}>
        <Ionicons name={getIonicon(category.icon)} size={24} color={category.color} />
      </View>
      <Text style={sty.cardName} numberOfLines={2}>
        {category.name}
      </Text>
      <Text style={sty.cardCount}>
        {category.moduleCount} módulos
      </Text>
    </TouchableOpacity>
  )
}

function ModuleContent({ module: mod }: { module: HubModule }) {
  const colors = useThemeColors()
  const router = useRouter()

  return (
    <View style={s.modulePlaceholder}>
      <View style={[s.moduleIcon, { backgroundColor: mod.color + '15' }]}>
        <Ionicons name={getIonicon(mod.icon)} size={40} color={mod.color} />
      </View>
      <Text style={[s.moduleTitle, { color: colors.textPrimary }]}>
        {mod.name}
      </Text>
      <Text style={[s.moduleDesc, { color: colors.textSecondary }]}>
        {mod.description}
      </Text>
      <TouchableOpacity
        style={[s.openBtn, { backgroundColor: mod.color }]}
        onPress={() => router.push(`/hub/module-detail?moduleId=${mod.id}`)}
        activeOpacity={0.7}
      >
        <Ionicons name="open-outline" size={18} color="white" />
        <Text style={s.openBtnText}>Abrir {mod.name}</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function VerticalScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { t } = useI18n()
  const { activeVertical, activeModules, setActiveVertical, clearVertical } = useVertical()
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null)

  const categories = useMemo(() => hubsService.getCategories(), [])

  const activeModule = useMemo(
    () => activeModules.find(m => m.id === activeModuleId) || activeModules[0] || null,
    [activeModules, activeModuleId]
  )

  if (activeVertical) {
    const headerModule = activeModule || activeModules[0]
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.verticalHeader}>
          <TouchableOpacity
            onPress={() => { clearVertical(); setActiveModuleId(null) }}
            style={s.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[s.verticalIcon, { backgroundColor: activeVertical.color + '15' }]}>
            <Ionicons name={getIonicon(activeVertical.icon)} size={18} color={activeVertical.color} />
          </View>
          <View style={s.verticalInfo}>
            <Text style={s.verticalName}>{activeVertical.name}</Text>
            <Text style={s.verticalDesc} numberOfLines={1}>{activeVertical.description}</Text>
          </View>
        </View>
        <VerticalPillTabs
          modules={activeModules}
          activeModuleId={activeModule?.id || null}
          onModuleSelect={mod => setActiveModuleId(mod.id)}
        />
        <ScrollView
          style={s.scrollArea}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {headerModule && <ModuleContent module={headerModule} />}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Verticales</Text>
        <Text style={s.headerSub}>
          {categories.length} verticales — {hubsService.totalModules} módulos
        </Text>
      </View>
      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={s.gridContainer}
        showsVerticalScrollIndicator={false}
      >
        {categories.map(cat => (
          <VerticalCard
            key={cat.id}
            category={cat}
            onPress={cat => setActiveVertical(cat)}
            colors={colors}
            styles={styl}
          />
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.lg,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    ...typography.h2,
    color: '#1C1C1E',
  },
  headerSub: {
    ...typography.bodySmall,
    color: '#8E8E93',
    marginTop: 2,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: layout.screenPadding,
    gap: spacing.md,
  },
  verticalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalInfo: {
    flex: 1,
  },
  verticalName: {
    ...typography.body,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  verticalDesc: {
    ...typography.caption,
    color: '#8E8E93',
  },
  modulePlaceholder: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  moduleIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  moduleTitle: {
    ...typography.h3,
    fontWeight: '700',
    textAlign: 'center',
  },
  moduleDesc: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    marginTop: spacing.md,
  },
  openBtnText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
})

const styl = StyleSheet.create({
  card: {
    width: CARD_SIZE,
    backgroundColor: 'white',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: 3,
    ...shadows.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  cardCount: {
    ...typography.caption,
    color: '#8E8E93',
    fontSize: 10,
  },
})

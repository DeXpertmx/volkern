import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing, radius, typography } from '../theme'
import { getIonicon } from '../utils/icons'
import type { HubModule } from '../types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface VerticalPillTabsProps {
  modules: HubModule[]
  activeModuleId: string | null
  onModuleSelect: (module: HubModule) => void
  backLabel?: string
  onBack?: () => void
}

export default function VerticalPillTabs({
  modules,
  activeModuleId,
  onModuleSelect,
  backLabel,
  onBack,
}: VerticalPillTabsProps) {
  const colors = useThemeColors()
  const scrollRef = useRef<ScrollView>(null)
  const [tabWidths, setTabWidths] = useState<Record<string, number>>({})

  const styles = useMemo(() => makeStyles(colors), [colors])

  useEffect(() => {
    if (activeModuleId && tabWidths[activeModuleId]) {
      const idx = modules.findIndex(m => m.id === activeModuleId)
      if (idx >= 0) {
        const offset = modules.slice(0, idx).reduce((sum, m) => sum + (tabWidths[m.id] || 100), 0)
        scrollRef.current?.scrollTo({ x: Math.max(0, offset - 40), animated: true })
      }
    }
  }, [activeModuleId, tabWidths, modules])

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {onBack && (
          <TouchableOpacity
            style={styles.backPill}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
            <Text style={styles.backLabel} numberOfLines={1}>
              {backLabel || 'Volver'}
            </Text>
          </TouchableOpacity>
        )}
        {modules.map(mod => {
          const isActive = mod.id === activeModuleId
          return (
            <TouchableOpacity
              key={mod.id}
              style={[
                styles.pill,
                isActive && { backgroundColor: mod.color + '18', borderColor: mod.color + '40' },
              ]}
              onPress={() => onModuleSelect(mod)}
              activeOpacity={0.7}
              onLayout={e => {
                const w = e.nativeEvent.layout.width
                setTabWidths(prev => ({ ...prev, [mod.id]: w }))
              }}
            >
              <Ionicons
                name={getIonicon(mod.icon)}
                size={16}
                color={isActive ? mod.color : colors.textTertiary}
              />
              <Text
                style={[
                  styles.pillLabel,
                  isActive && { color: mod.color, fontWeight: '700' },
                ]}
                numberOfLines={1}
              >
                {mod.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    scrollContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: spacing.xs,
    },
    backPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      marginRight: spacing.xs,
    },
    backLabel: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.textSecondary,
      maxWidth: 80,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    pillLabel: {
      ...typography.caption,
      fontWeight: '500',
      color: colors.textSecondary,
      maxWidth: 100,
    },
  })

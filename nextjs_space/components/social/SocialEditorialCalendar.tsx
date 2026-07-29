'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Music,
  CheckCircle2,
  AlertCircle,
  Trash2,
  MoreHorizontal,
  List,
  Grid,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────
interface CalendarPost {
  id: string
  content: string
  platforms: string[]
  mediaUrls: string[]
  status: string
  scheduledFor: string | null
  createdAt: string
}

interface SocialEditorialCalendarProps {
  posts: CalendarPost[]
  onRefresh: () => void
  onCreatePost: (date: Date) => void
  onEditPost: (post: CalendarPost) => void
}

type ViewMode = 'month' | 'week'

const PLATFORM_CONFIG: Record<string, { name: string; Icon: any; color: string; bg: string; border: string }> = {
  facebook: { name: 'Facebook', Icon: Facebook, color: '#1877F2', bg: 'bg-blue-50', border: 'border-l-blue-500' },
  instagram: { name: 'Instagram', Icon: Instagram, color: '#E4405F', bg: 'bg-pink-50', border: 'border-l-pink-500' },
  linkedin: { name: 'LinkedIn', Icon: Linkedin, color: '#0A66C2', bg: 'bg-sky-50', border: 'border-l-sky-500' },
  youtube: { name: 'YouTube', Icon: Youtube, color: '#FF0000', bg: 'bg-red-50', border: 'border-l-red-500' },
  tiktok: { name: 'TikTok', Icon: Music, color: '#010101', bg: 'bg-slate-50', border: 'border-l-slate-900' },
}

// ─── Helpers ────────────────────────────────────────────────────────────
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isToday(year: number, month: number, day: number): boolean {
  const today = new Date()
  return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

// ─── Platform Pills ─────────────────────────────────────────────────────
function PlatformPill({ platform }: { platform: string }) {
  const cfg = PLATFORM_CONFIG[platform]
  if (!cfg) return null
  const { Icon } = cfg
  return (
    <div
      className="h-5 w-5 rounded-md flex items-center justify-center shrink-0 border"
      style={{ backgroundColor: cfg.bg, borderColor: cfg.color + '30' }}
      title={cfg.name}
    >
      <Icon className="h-3 w-3" style={{ color: cfg.color }} />
    </div>
  )
}

// ─── Post Pill (for day cells) ──────────────────────────────────────────
function PostPill({
  post,
  onDragStart,
  onClick,
}: {
  post: CalendarPost
  onDragStart: (e: React.DragEvent, post: CalendarPost) => void
  onClick: (post: CalendarPost) => void
}) {
  const primaryPlatform = post.platforms[0] || 'facebook'
  const cfg = PLATFORM_CONFIG[primaryPlatform]
  const isPublished = post.status === 'published'
  const hasImage = post.mediaUrls?.[0]

  return (
    <div
      draggable={post.status !== 'published'}
      onDragStart={(e) => onDragStart(e, post)}
      onClick={() => onClick(post)}
      className={`
        group relative flex items-center gap-1 px-1.5 py-0.5 rounded-md cursor-pointer
        text-[9px] font-bold truncate max-w-full border-l-2 transition-all
        hover:shadow-sm hover:scale-[1.02]
        ${isPublished ? 'opacity-60' : ''}
        ${cfg ? cfg.border : 'border-l-slate-300'}
        ${isPublished ? 'bg-green-50/50' : 'bg-white hover:bg-slate-50'}
      `}
      style={{ borderLeftColor: cfg?.color }}
    >
      {hasImage && (
        <div className="h-3 w-3 rounded-sm overflow-hidden shrink-0 bg-slate-100">
          <img src={post.mediaUrls[0]} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <span className="truncate text-[9px] text-slate-700">
        {post.content.slice(0, 25)}
      </span>
      {post.platforms.length > 1 && (
        <span className="text-[7px] text-slate-400 font-bold shrink-0">+{post.platforms.length - 1}</span>
      )}
      {isPublished && <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />}
    </div>
  )
}

// ─── Day Cell ───────────────────────────────────────────────────────────
function DayCell({
  day,
  posts,
  year,
  month,
  onDrop,
  onDayClick,
  onPostClick,
  onDragStart,
  isCurrentMonth,
}: {
  day: number
  posts: CalendarPost[]
  year: number
  month: number
  onDrop: (e: React.DragEvent, date: Date) => void
  onDayClick: (date: Date) => void
  onPostClick: (post: CalendarPost) => void
  onDragStart: (e: React.DragEvent, post: CalendarPost) => void
  isCurrentMonth: boolean
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const date = new Date(year, month, day)
  const dateKey = formatDateKey(year, month, day)
  const today = isToday(year, month, day)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      onDrop(e, date)
    },
    [date, onDrop],
  )

  const scheduledPosts = posts.filter(
    (p) =>
      p.scheduledFor &&
      isSameDay(new Date(p.scheduledFor), date),
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onDayClick(date)}
      className={`
        relative min-h-[90px] p-1.5 border border-slate-100 rounded-lg
        transition-all duration-150 cursor-pointer group
        ${isDragOver ? 'bg-indigo-50 border-indigo-300 shadow-inner scale-[1.02]' : 'hover:bg-slate-50/50'}
        ${today ? 'bg-indigo-50/30 border-indigo-200' : ''}
        ${!isCurrentMonth ? 'opacity-30' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`
            text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full
            ${today ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}
          `}
        >
          {day}
        </span>
        {scheduledPosts.length > 0 && (
          <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
            {scheduledPosts.length}
          </span>
        )}
      </div>

      <div className="space-y-0.5 overflow-hidden max-h-[60px]">
        {scheduledPosts.slice(0, 3).map((post) => (
          <PostPill
            key={post.id}
            post={post}
            onDragStart={onDragStart}
            onClick={(p) => {
              p.scheduledFor = post.scheduledFor // keep reference
              onPostClick(p)
            }}
          />
        ))}
        {scheduledPosts.length > 3 && (
          <div className="text-[8px] font-bold text-slate-400 text-center">
            +{scheduledPosts.length - 3} más
          </div>
        )}
      </div>

      {/* Quick add button (visible on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDayClick(date)
        }}
        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white border border-slate-200 opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm"
      >
        <Plus className="h-3 w-3 text-indigo-500" />
      </button>
    </div>
  )
}

// ─── Post Detail Popover ────────────────────────────────────────────────
function PostDetailPopover({
  post,
  onClose,
  onDelete,
  onScheduleChange,
}: {
  post: CalendarPost
  onClose: () => void
  onDelete: (id: string) => void
  onScheduleChange: (id: string, newDate: Date) => void
}) {
  const [newDate, setNewDate] = useState(
    post.scheduledFor ? post.scheduledFor.slice(0, 10) : '',
  )
  const [newTime, setNewTime] = useState(
    post.scheduledFor
      ? new Date(post.scheduledFor).toTimeString().slice(0, 5)
      : '12:00',
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSaveDate = async () => {
    if (!newDate) return
    setSaving(true)
    try {
      const combinedDate = new Date(`${newDate}T${newTime}:00`)
      const res = await fetch(`/api/social/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: combinedDate.toISOString() }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Fecha actualizada')
        onScheduleChange(post.id, combinedDate)
        onClose()
      } else {
        toast.error(data.error || 'Error al actualizar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('¿Eliminar esta publicación definitivamente?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/social/posts/${post.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Publicación eliminada')
        onDelete(post.id)
        onClose()
      } else {
        toast.error(data.error || 'Error al eliminar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setDeleting(false)
    }
  }

  const primaryPlatform = post.platforms[0] || 'facebook'
  const cfg = PLATFORM_CONFIG[primaryPlatform]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            {post.platforms.map((p) => (
              <PlatformPill key={p} platform={p} />
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Badge
              className={`text-[9px] font-black px-2 py-0.5 border-none ${
                post.status === 'published'
                  ? 'bg-green-100 text-green-700'
                  : post.status === 'scheduled'
                  ? 'bg-amber-100 text-amber-700'
                  : post.status === 'draft'
                  ? 'bg-slate-100 text-slate-500'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {post.status === 'published'
                ? 'Publicado'
                : post.status === 'scheduled'
                ? 'Programado'
                : post.status === 'draft'
                ? 'Borrador'
                : 'Error'}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {post.mediaUrls?.[0] && (
            <div className="aspect-video rounded-2xl overflow-hidden bg-slate-50">
              <img
                src={post.mediaUrls[0]}
                alt="Media"
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {post.content}
          </p>

          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
            <Clock className="h-3 w-3" />
            {post.scheduledFor
              ? `Programado: ${new Date(post.scheduledFor).toLocaleDateString('es-MX', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : 'Sin fecha — ' + new Date(post.createdAt).toLocaleDateString()}
          </div>

          {/* Date editor */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Reprogramar
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-24 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <Button
              onClick={handleSaveDate}
              disabled={saving}
              className="w-full rounded-xl h-9 text-[10px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? 'Guardando...' : 'Guardar Fecha'}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-xl border-red-100 text-red-500 hover:bg-red-50 h-8 text-[10px] font-black gap-1.5"
          >
            {deleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Eliminar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-xl h-8 text-[10px] font-bold"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Legend ─────────────────────────────────────────────────────────────
function PlatformLegend() {
  return (
    <div className="flex items-center gap-3 text-[9px] font-bold text-slate-500">
      {Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => {
        const { Icon } = cfg
        return (
          <div key={key} className="flex items-center gap-1">
            <Icon className="h-3 w-3" style={{ color: cfg.color }} />
            <span>{cfg.name}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────
export function SocialEditorialCalendar({
  posts,
  onRefresh,
  onCreatePost,
  onEditPost,
}: SocialEditorialCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null)
  const dragPostRef = useRef<CalendarPost | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Navigate months/weeks
  const goPrev = () => {
    const d = new Date(currentDate)
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1)
    } else {
      d.setDate(d.getDate() - 7)
    }
    setCurrentDate(d)
  }

  const goNext = () => {
    const d = new Date(currentDate)
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1)
    } else {
      d.setDate(d.getDate() + 7)
    }
    setCurrentDate(d)
  }

  const goToday = () => setCurrentDate(new Date())

  // Build month grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const daysInPrevMonth = getDaysInMonth(year, month - 1 < 0 ? 0 : month - 1)

    const days: Array<{ day: number; isCurrentMonth: boolean }> = []

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false })
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true })
    }

    // Next month padding to fill 6 rows
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false })
    }

    return days
  }, [year, month])

  // Build week view (current week)
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate)
    const dayOfWeek = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [currentDate, viewMode])

  // Drag & drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, post: CalendarPost) => {
    dragPostRef.current = post
    e.dataTransfer.setData('text/plain', post.id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDrop = useCallback(
    async (_e: React.DragEvent, date: Date) => {
      const post = dragPostRef.current
      if (!post) return

      dragPostRef.current = null

      try {
        const res = await fetch(`/api/social/posts/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledFor: date.toISOString() }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success(`Publicación movida al ${date.toLocaleDateString('es-MX')}`)
          onRefresh()
        } else {
          toast.error(data.error || 'Error al mover publicación')
        }
      } catch {
        toast.error('Error de conexión')
      }
    },
    [onRefresh],
  )

  const handleDayClick = useCallback(
    (date: Date) => {
      onCreatePost(date)
    },
    [onCreatePost],
  )

  const handlePostClick = useCallback((post: CalendarPost) => {
    setSelectedPost(post)
  }, [])

  const handleDeletePost = useCallback(
    (id: string) => {
      onRefresh()
    },
    [onRefresh],
  )

  const handleScheduleChange = useCallback(
    (_id: string, _newDate: Date) => {
      onRefresh()
    },
    [onRefresh],
  )

  // Count scheduled posts
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length
  const draftCount = posts.filter((p) => p.status === 'draft').length
  const publishedCount = posts.filter((p) => p.status === 'published').length

  // Today's posts
  const todayPosts = posts.filter(
    (p) =>
      p.scheduledFor &&
      isSameDay(new Date(p.scheduledFor), new Date()),
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Stats bar */}
      <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-black text-indigo-600">{scheduledCount}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Programados</span>
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2 text-xs">
          <span className="font-black text-amber-600">{draftCount}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Borradores</span>
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2 text-xs">
          <span className="font-black text-green-600">{publishedCount}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Publicados</span>
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <PlatformLegend />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            className="rounded-xl h-8 text-[10px] font-black uppercase tracking-widest border-slate-200"
          >
            Hoy
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrev}
            className="h-8 w-8 rounded-xl"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            className="h-8 w-8 rounded-xl"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-black text-slate-900 tracking-tighter">
            {MONTHS[month]} {year}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-0.5 rounded-lg flex">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <Grid className="h-3.5 w-3.5 inline mr-1" />
              Mes
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'week' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <List className="h-3.5 w-3.5 inline mr-1" />
              Semana
            </button>
          </div>
        </div>
      </div>

      {/* Today's upcoming posts */}
      {todayPosts.length > 0 && (
        <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <CalendarIcon className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="text-[11px] font-bold text-indigo-800">
            {todayPosts.length} publicacion{todayPosts.length !== 1 ? 'es' : ''} programada{todayPosts.length !== 1 ? 's' : ''} para hoy
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto rounded-xl h-7 text-[10px] font-bold text-indigo-600"
            onClick={() => {
              // Scroll or focus could go here
            }}
          >
            Ver
          </Button>
        </div>
      )}

      {/* Calendar Grid */}
      {viewMode === 'month' ? (
        <>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((d, idx) => (
              <DayCell
                key={`${d.day}-${idx}`}
                day={d.day}
                posts={posts}
                year={d.isCurrentMonth ? year : month === 0 && !d.isCurrentMonth ? year - 1 : month === 11 && !d.isCurrentMonth ? year + 1 : year}
                month={
                  d.isCurrentMonth
                    ? month
                    : idx < getFirstDayOfMonth(year, month)
                    ? month - 1 < 0
                      ? 11
                      : month - 1
                    : month + 1 > 11
                    ? 0
                    : month + 1
                }
                onDrop={handleDrop}
                onDayClick={handleDayClick}
                onPostClick={handlePostClick}
                onDragStart={handleDragStart}
                isCurrentMonth={d.isCurrentMonth}
              />
            ))}
          </div>
        </>
      ) : (
        /* Week View */
        <div className="space-y-2">
          {weekDays.map((date) => {
            const dayPosts = posts.filter(
              (p) =>
                p.scheduledFor && isSameDay(new Date(p.scheduledFor), date),
            )
            const today = isSameDay(date, new Date())

            return (
              <div
                key={date.toISOString()}
                className={`flex gap-3 p-3 rounded-2xl border transition-all ${
                  today
                    ? 'bg-indigo-50/30 border-indigo-200'
                    : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => handleDrop(e, date)}
              >
                <div className="w-16 shrink-0 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400">
                    {WEEKDAYS[date.getDay()]}
                  </p>
                  <p
                    className={`text-xl font-black ${
                      today ? 'text-indigo-600' : 'text-slate-800'
                    }`}
                  >
                    {date.getDate()}
                  </p>
                </div>

                <div className="flex-1 space-y-1.5 min-h-[60px]">
                  {dayPosts.length === 0 ? (
                    <p className="text-[10px] text-slate-300 italic pt-4">
                      Arrastra una publicación aquí o haz clic para crear
                    </p>
                  ) : (
                    dayPosts.map((post) => (
                      <div
                        key={post.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100"
                      >
                        <div className="flex items-center gap-1">
                          {post.platforms.map((p) => (
                            <PlatformPill key={p} platform={p} />
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-700 truncate flex-1">
                          {post.content.slice(0, 60)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-lg"
                          onClick={() => handlePostClick(post)}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <button
                  onClick={() => handleDayClick(date)}
                  className="self-center h-8 w-8 rounded-xl border border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 flex items-center justify-center transition-all shrink-0"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-300 hover:text-indigo-500" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailPopover
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onDelete={handleDeletePost}
          onScheduleChange={handleScheduleChange}
        />
      )}
    </div>
  )
}

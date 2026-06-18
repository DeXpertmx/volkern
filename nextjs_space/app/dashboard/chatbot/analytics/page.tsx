'use client';

import { useState, useEffect, useCallback } from 'react';

import {
  Bot,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Heart,
  HeartCrack,
  Users,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  Loader2,
  Sparkles,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Zap,
  ChevronRight,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  ArrowUp,
  ArrowDown,
  Bell,
  BellOff,
  Send,
  CheckCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────

interface AnalyticsMetrics {
  totalConversations: number;
  resolvedConversations: number;
  resolutionRate: number;
  frustratedConversations: number;
  frustrationRate: number;
  avgSentiment: number;
  humanTransfers: number;
  transferRate: number;
}

interface TopTopic {
  topic: string;
  count: number;
}

interface OverviewData {
  period: string;
  metrics: AnalyticsMetrics;
  patterns: any[];
  suggestions: any[];
  topTopics: TopTopic[];
}

interface Pattern {
  type: string;
  severity: string;
  description: string;
  value: number;
  threshold: number;
  context: Record<string, any>;
  recommendation: string;
  detectedAt: string;
}

interface Suggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  implementationGuide: string;
  estimatedImpact: string;
  category: string;
  createdAt: string;
}

interface ConversationAnalysis {
  conversationId: string;
  sentiment: string;
  sentimentScore: number;
  resolved: boolean;
  totalMessages: number;
  durationMinutes: number;
  topics: string[];
  analyzedAt: string;
}

interface AlertEntry {
  id: string;
  severity: string;
  patternCount: number;
  severities: string[];
  channels: string[];
  sentAt: string;
}

// ─── Constants ──────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-600 border-red-200 dark:border-red-800',
  high: 'bg-orange-500/15 text-orange-600 border-orange-200 dark:border-orange-800',
  medium: 'bg-yellow-500/15 text-yellow-600 border-yellow-200 dark:border-yellow-800',
  low: 'bg-blue-500/15 text-blue-600 border-blue-200 dark:border-blue-800',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-600',
  in_progress: 'bg-blue-500/15 text-blue-600',
  applied: 'bg-emerald-500/15 text-emerald-600',
  dismissed: 'bg-gray-500/15 text-gray-500',
};

const PATTERN_LABELS: Record<string, string> = {
  high_unknown_rate: 'Alta tasa de desconocidos',
  high_fallback_rate: 'Alta tasa de fallback',
  skill_failure: 'Fallo en skill',
  sentiment_drop: 'Caída de sentimiento',
  frequent_human_transfer: 'Transferencias frecuentes',
  low_resolution_rate: 'Baja resolución',
  peak_error_hour: 'Pico de errores',
  repeated_unanswered: 'Consultas sin respuesta',
};

const SENTIMENT_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ─── Helpers ────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / 3600000);

  if (hours < 1) return 'Hace unos minutos';
  if (hours < 24) return `Hace ${hours}h`;
  if (hours < 48) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function getSentimentLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Positivo', color: 'text-emerald-600' };
  if (score >= 45) return { label: 'Neutral', color: 'text-blue-600' };
  if (score >= 25) return { label: 'Negativo', color: 'text-orange-600' };
  return { label: 'Frustrado', color: 'text-red-600' };
}

function getPatternIcon(type: string) {
  switch (type) {
    case 'high_unknown_rate': return <Search className="h-4 w-4" />;
    case 'high_fallback_rate': return <AlertTriangle className="h-4 w-4" />;
    case 'skill_failure': return <XCircle className="h-4 w-4" />;
    case 'sentiment_drop': return <HeartCrack className="h-4 w-4" />;
    case 'frequent_human_transfer': return <Users className="h-4 w-4" />;
    case 'low_resolution_rate': return <BarChart3 className="h-4 w-4" />;
    case 'peak_error_hour': return <Clock className="h-4 w-4" />;
    case 'repeated_unanswered': return <Search className="h-4 w-4" />;
    default: return <Activity className="h-4 w-4" />;
  }
}

// ─── Main Component ─────────────────────────────────────

export default function ChatbotAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState('48');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [conversations, setConversations] = useState<ConversationAnalysis[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [runningDetection, setRunningDetection] = useState(false);

  // ─── Data fetching ────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`/api/chatbot/analytics?hours=${period}`);
      if (!res.ok) throw new Error('Error fetching overview');
      const data = await res.json();
      setOverview(data);
    } catch (e) {
      console.error('Error loading overview:', e);
    }
  }, [period]);

  const fetchPatterns = useCallback(async () => {
    try {
      const res = await fetch(`/api/chatbot/analytics?type=patterns&hours=${period}`);
      if (!res.ok) throw new Error('Error fetching patterns');
      const data = await res.json();
      setPatterns(data.patterns || []);
    } catch (e) {
      console.error('Error loading patterns:', e);
    }
  }, [period]);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chatbot/analytics?type=suggestions&hours=${period}`);
      if (!res.ok) throw new Error('Error fetching suggestions');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      console.error('Error loading suggestions:', e);
    }
  }, [period]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/chatbot/analytics?type=conversations&hours=${period}`);
      if (!res.ok) throw new Error('Error fetching conversations');
      const data = await res.json();
      setConversations(data.analyses || []);
    } catch (e) {
      console.error('Error loading conversations:', e);
    }
  }, [period]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`/api/chatbot/analytics?type=alerts&hours=${period}`);
      if (!res.ok) throw new Error('Error fetching alerts');
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (e) {
      console.error('Error loading alerts:', e);
    }
  }, [period]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOverview(), fetchPatterns(), fetchSuggestions(), fetchConversations(), fetchAlerts()]);
    setLoading(false);
  }, [fetchOverview, fetchPatterns, fetchSuggestions, fetchConversations, fetchAlerts]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Actions ──────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleRunDetection = async () => {
    setRunningDetection(true);
    try {
      const res = await fetch('/api/chatbot/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_suggestions', hours: parseInt(period) }),
      });
      if (!res.ok) throw new Error('Error running detection');
      const data = await res.json();
      toast.success(`${data.patternsDetected} patrones detectados, ${data.suggestionsGenerated} sugerencias generadas`);
      await Promise.all([fetchOverview(), fetchPatterns(), fetchSuggestions(), fetchAlerts()]);
    } catch (e) {
      toast.error('Error al ejecutar detección');
    } finally {
      setRunningDetection(false);
    }
  };

  // ─── Loading state ────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando analytics del chatbot...</p>
        </div>
      </div>
    );
  }

  const metrics = overview?.metrics;

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            Analytics del Chatbot
          </h1>
          <p className="text-muted-foreground mt-1">
            Métricas, patrones y sugerencias de mejora para tu asistente IA
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="24">Últimas 24h</option>
            <option value="48">Últimas 48h</option>
            <option value="168">Últimos 7 días</option>
            <option value="720">Últimos 30 días</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            Actualizar
          </Button>

          <Button
            size="sm"
            onClick={handleRunDetection}
            disabled={runningDetection}
            className="gap-2"
          >
            {runningDetection ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {runningDetection ? 'Analizando...' : 'Ejecutar análisis'}
          </Button>

          <NotificationConfigDialog />
        </div>
      </div>

      {/* ═══ KPI Cards ═══ */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Conversaciones</p>
                  <p className="text-3xl font-bold mt-1">{metrics.totalConversations}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-emerald-600 font-medium">{metrics.resolvedConversations}</span> resueltas
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/50">
                  <MessageSquare className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tasa de Resolución</p>
                  <p className="text-3xl font-bold mt-1">{metrics.resolutionRate}%</p>
                  <div className="h-2 mt-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        metrics.resolutionRate >= 70 ? 'bg-emerald-500' :
                        metrics.resolutionRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                      style={{ width: `${metrics.resolutionRate}%` }}
                    />
                  </div>
                </div>
                <div className={cn(
                  'p-3 rounded-xl',
                  metrics.resolutionRate >= 70 ? 'bg-emerald-100 dark:bg-emerald-900/50' :
                  metrics.resolutionRate >= 40 ? 'bg-yellow-100 dark:bg-yellow-900/50' :
                  'bg-red-100 dark:bg-red-900/50'
                )}>
                  <CheckCircle2 className={cn(
                    'h-6 w-6',
                    metrics.resolutionRate >= 70 ? 'text-emerald-600' :
                    metrics.resolutionRate >= 40 ? 'text-yellow-600' : 'text-red-600'
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sentimiento Promedio</p>
                  <p className="text-3xl font-bold mt-1">{metrics.avgSentiment}</p>
                  <p className={cn('text-xs mt-1 font-medium', getSentimentLabel(metrics.avgSentiment).color)}>
                    {getSentimentLabel(metrics.avgSentiment).label}
                  </p>
                </div>
                <div className={cn(
                  'p-3 rounded-xl',
                  metrics.avgSentiment >= 70 ? 'bg-emerald-100 dark:bg-emerald-900/50' :
                  metrics.avgSentiment >= 45 ? 'bg-blue-100 dark:bg-blue-900/50' :
                  'bg-red-100 dark:bg-red-900/50'
                )}>
                  {metrics.avgSentiment >= 45
                    ? <Heart className={cn('h-6 w-6', metrics.avgSentiment >= 70 ? 'text-emerald-600' : 'text-blue-600')} />
                    : <HeartCrack className="h-6 w-6 text-red-600" />
                  }
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Transferencias a Humano</p>
                  <p className="text-3xl font-bold mt-1">{metrics.humanTransfers}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className={cn(
                      'font-medium',
                      metrics.transferRate > 15 ? 'text-red-600' : 'text-emerald-600'
                    )}>
                      {metrics.transferRate}%
                    </span> del total
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/50">
                  <Users className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ Additional metrics row ═══ */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <HeartCrack className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Frustradas</p>
                <p className="text-lg font-bold">{metrics.frustratedConversations}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resueltas</p>
                <p className="text-lg font-bold">{metrics.resolvedConversations}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Activity className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tasa Frustración</p>
                <p className="text-lg font-bold">{metrics.frustrationRate}%</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tasa Transferencia</p>
                <p className="text-lg font-bold">{metrics.transferRate}%</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ Charts row ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Distribución de Sentimiento
            </CardTitle>
            <CardDescription>
              Proporción de conversaciones por estado de ánimo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              // Compute sentiment counts ONCE for pie + legend
              const counts = { positive: 0, neutral: 0, negative: 0, frustrated: 0 };
              conversations.forEach(c => {
                if (c.sentiment === 'positive' || c.sentimentScore >= 70) counts.positive++;
                else if (c.sentiment === 'frustrated' || c.sentimentScore < 25) counts.frustrated++;
                else if (c.sentiment === 'negative' || c.sentimentScore < 45) counts.negative++;
                else counts.neutral++;
              });
              const pieData = [
                { name: 'Positivo', value: counts.positive },
                { name: 'Neutral', value: counts.neutral },
                { name: 'Negativo', value: counts.negative },
                { name: 'Frustrado', value: counts.frustrated },
              ].filter(d => d.value > 0);
              const legendItems = [
                { label: 'Positivo', color: 'bg-emerald-500', value: counts.positive },
                { label: 'Neutral', color: 'bg-blue-500', value: counts.neutral },
                { label: 'Negativo', color: 'bg-yellow-500', value: counts.negative },
                { label: 'Frustrado', color: 'bg-red-500', value: counts.frustrated },
              ].filter(d => d.value > 0);

              return conversations.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="60%" height={240}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%" cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={entry.name} fill={SENTIMENT_COLORS[i]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {legendItems.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <div className={cn('w-3 h-3 rounded-full', item.color)} />
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                        <span className="text-sm font-bold ml-auto">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                  No hay datos de conversaciones en este período
                </div>
              );
            })()}
            ) : (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                No hay datos de conversaciones en este período
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Topics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Temas más frecuentes
            </CardTitle>
            <CardDescription>
              Tópicos más mencionados en las conversaciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview?.topTopics && overview.topTopics.length > 0 ? (
              <div className="space-y-3">
                {overview.topTopics.map((topic, i) => {
                  const maxCount = overview.topTopics[0].count;
                  const pct = Math.round((topic.count / maxCount) * 100);
                  return (
                    <div key={topic.topic} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium truncate max-w-[200px]">{topic.topic}</span>
                          <span className="text-xs text-muted-foreground">{topic.count}x</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              i === 0 ? 'bg-primary' :
                              i === 1 ? 'bg-blue-500' :
                              i === 2 ? 'bg-emerald-500' :
                              'bg-muted-foreground/30'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                No hay temas registrados en este período
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Main Tabs ═══ */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-4">
          <TabsTrigger value="patterns" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Patrones
            {patterns.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{patterns.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Sugerencias
            {suggestions.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{suggestions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="conversations" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversaciones
            {conversations.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{conversations.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alertas
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{alerts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Patterns Tab ────────────────────────────── */}
        <TabsContent value="patterns" className="space-y-4">
          {patterns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin patrones anómalos</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  No se detectaron patrones de error en el período seleccionado.
                  Ejecuta un análisis manual para verificar el estado actual.
                </p>
                <Button
                  size="sm"
                  className="mt-4 gap-2"
                  onClick={handleRunDetection}
                  disabled={runningDetection}
                >
                  {runningDetection ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Ejecutar análisis ahora
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {patterns.map((pattern, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        'p-2.5 rounded-xl',
                        pattern.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/30' :
                        pattern.severity === 'high' ? 'bg-orange-100 dark:bg-orange-900/30' :
                        'bg-yellow-100 dark:bg-yellow-900/30'
                      )}>
                        {getPatternIcon(pattern.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold">
                            {PATTERN_LABELS[pattern.type] || pattern.type}
                          </h4>
                          <Badge
                            variant="outline"
                            className={cn('text-xs', SEVERITY_COLORS[pattern.severity] || '')}
                          >
                            {pattern.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{pattern.description}</p>

                        {/* Value bar */}
                        <div className="mt-3 flex items-center gap-3">
                          <div className="flex-1">
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  pattern.value >= 70 ? 'bg-red-500' :
                                  pattern.value >= 40 ? 'bg-orange-500' : 'bg-yellow-500'
                                )}
                                style={{ width: `${Math.min(pattern.value, 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold">{pattern.value}%</span>
                          <span className="text-xs text-muted-foreground">
                            umbral: {pattern.threshold}%
                          </span>
                        </div>

                        <Separator className="my-3" />

                        <div className="flex items-start gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-sm text-muted-foreground">{pattern.recommendation}</p>
                        </div>

                        <p className="text-xs text-muted-foreground mt-2">
                          Detectado {formatDate(pattern.detectedAt)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Suggestions Tab ─────────────────────────── */}
        <TabsContent value="suggestions" className="space-y-4">
          {suggestions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Lightbulb className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin sugerencias</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  No hay sugerencias de mejora disponibles. Ejecuta un análisis para generar
                  recomendaciones basadas en los patrones detectados.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {suggestions.map((suggestion) => (
                <Card key={suggestion.id} className="hover:shadow-md transition-shadow group">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'p-2 rounded-lg shrink-0',
                        suggestion.priority === 'critical' ? 'bg-red-100 dark:bg-red-900/30' :
                        suggestion.priority === 'high' ? 'bg-orange-100 dark:bg-orange-900/30' :
                        suggestion.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                        'bg-blue-100 dark:bg-blue-900/30'
                      )}>
                        <Lightbulb className={cn(
                          'h-5 w-5',
                          suggestion.priority === 'critical' ? 'text-red-600' :
                          suggestion.priority === 'high' ? 'text-orange-600' :
                          suggestion.priority === 'medium' ? 'text-yellow-600' :
                          'text-blue-600'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm">{suggestion.title}</h4>
                          <Badge
                            variant="outline"
                            className={cn('text-xs', STATUS_COLORS[suggestion.status] || '')}
                          >
                            {suggestion.status === 'pending' ? 'Pendiente' :
                             suggestion.status === 'in_progress' ? 'En progreso' :
                             suggestion.status === 'applied' ? 'Aplicada' : 'Descartada'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{suggestion.priority}</Badge>
                        </div>

                        <p className="text-xs text-muted-foreground mt-1">
                          {suggestion.description}
                        </p>

                        <Separator className="my-2" />

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Impacto estimado:
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {suggestion.estimatedImpact}
                          </p>
                        </div>

                        <details className="mt-2">
                          <summary className="text-xs text-primary cursor-pointer hover:underline">
                            Ver guía de implementación
                          </summary>
                          <pre className="mt-2 text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap font-sans">
                            {suggestion.implementationGuide}
                          </pre>
                        </details>

                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDate(suggestion.createdAt)} • {suggestion.category === 'knowledge_base' ? 'Base de conocimiento' :
                           suggestion.category === 'training' ? 'Entrenamiento' :
                           suggestion.category === 'configuration' ? 'Configuración' :
                           suggestion.category === 'skill' ? 'Skill' :
                           suggestion.category === 'threshold' ? 'Threshold' : 'Infraestructura'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Conversations Tab ───────────────────────── */}
        <TabsContent value="conversations" className="space-y-4">
          {conversations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin conversaciones analizadas</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  No hay análisis de conversaciones disponibles en el período seleccionado.
                  Las conversaciones se analizan automáticamente cuando se completan.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Conversation metrics bar chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resolución por Sentimiento</CardTitle>
                  <CardDescription>
                    Conversaciones agrupadas por sentimiento y estado de resolución
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={(() => {
                        const groups: Record<string, { total: number; resolved: number }> = {
                          Positivo: { total: 0, resolved: 0 },
                          Neutral: { total: 0, resolved: 0 },
                          Negativo: { total: 0, resolved: 0 },
                          Frustrado: { total: 0, resolved: 0 },
                        };
                        conversations.forEach(c => {
                          const key = c.sentimentScore >= 70 ? 'Positivo' :
                                      c.sentimentScore < 25 || c.sentiment === 'frustrated' ? 'Frustrado' :
                                      c.sentimentScore < 45 || c.sentiment === 'negative' ? 'Negativo' : 'Neutral';
                          groups[key].total++;
                          if (c.resolved) groups[key].resolved++;
                        });
                        return Object.entries(groups).map(([name, data]) => ({
                          name,
                          Total: data.total,
                          Resueltas: data.resolved,
                        }));
                      })()}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total" />
                      <Bar dataKey="Resueltas" fill="#22c55e" radius={[4, 4, 0, 0]} name="Resueltas" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Recent conversation analyses */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Análisis Recientes</CardTitle>
                  <CardDescription>
                    Últimas conversaciones analizadas por el sistema
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {conversations.slice(0, 10).map((conv, i) => (
                    <div
                      key={conv.conversationId || i}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          'p-1.5 rounded-lg shrink-0',
                          conv.sentimentScore >= 70 ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                          conv.sentimentScore >= 45 ? 'bg-blue-100 dark:bg-blue-900/30' :
                          conv.sentimentScore >= 25 ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                          'bg-red-100 dark:bg-red-900/30'
                        )}>
                          {conv.sentimentScore >= 70 ? (
                            <Heart className="h-4 w-4 text-emerald-600" />
                          ) : conv.sentimentScore >= 45 ? (
                            <Heart className="h-4 w-4 text-blue-600" />
                          ) : (
                            <HeartCrack className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate max-w-[200px]">
                              {conv.topics?.slice(0, 2).join(', ') || 'Sin temas'}
                            </span>
                            {conv.resolved ? (
                              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                Resuelta
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-200">
                                No resuelta
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {conv.totalMessages} mensajes · {conv.durationMinutes} min · Score: {conv.sentimentScore}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {formatDate(conv.analyzedAt)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── Alerts Tab ──────────────────────────────── */}
        <TabsContent value="alerts" className="space-y-4">
          {alerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin alertas enviadas</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  No se han enviado alertas en el período seleccionado.
                  Activa las notificaciones y ejecuta un análisis para recibir alertas
                  cuando se detecten patrones críticos.
                </p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Find and click the header's Alertas button to open the config dialog
                      const headerAlertBtn = document.querySelector('[data-alert-config-trigger]') as HTMLButtonElement
                      headerAlertBtn?.click()
                    }}
                    className="gap-2"
                  >
                    <Bell className="h-4 w-4" />
                    Configurar alertas
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleRunDetection}
                    disabled={runningDetection}
                    className="gap-2"
                  >
                    {runningDetection ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Ejecutar análisis
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  Historial de Alertas
                </CardTitle>
                <CardDescription>
                  Notificaciones enviadas automáticamente cuando se detectaron patrones anómalos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium text-muted-foreground">Severidad</th>
                        <th className="pb-3 font-medium text-muted-foreground">Patrones</th>
                        <th className="pb-3 font-medium text-muted-foreground hidden sm:table-cell">Canales</th>
                        <th className="pb-3 font-medium text-muted-foreground hidden md:table-cell">Severidades</th>
                        <th className="pb-3 font-medium text-muted-foreground text-right">Enviado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((alert, i) => (
                        <tr key={alert.id} className={cn(
                          'border-b last:border-0 transition-colors hover:bg-muted/50',
                          i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                        )}>
                          <td className="py-3 pr-4">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                alert.severity === 'critical' ? 'bg-red-500/15 text-red-600 border-red-200 dark:border-red-800' :
                                alert.severity === 'high' ? 'bg-orange-500/15 text-orange-600 border-orange-200 dark:border-orange-800' :
                                'bg-yellow-500/15 text-yellow-600 border-yellow-200 dark:border-yellow-800'
                              )}
                            >
                              {alert.severity === 'critical' ? 'Crítico' :
                               alert.severity === 'high' ? 'Alto' :
                               alert.severity === 'medium' ? 'Medio' : 'Info'}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="font-mono font-bold text-lg">{alert.patternCount}</span>
                          </td>
                          <td className="py-3 pr-4 hidden sm:table-cell">
                            <div className="flex gap-1.5 flex-wrap">
                              {alert.channels.map(ch => (
                                <span
                                  key={ch}
                                  className={cn(
                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                    ch === 'in_app' ? 'bg-blue-500/10 text-blue-600' :
                                    ch === 'telegram' ? 'bg-sky-500/10 text-sky-600' :
                                    'bg-emerald-500/10 text-emerald-600'
                                  )}
                                >
                                  {ch === 'in_app' ? 'In-App' : ch === 'telegram' ? 'Telegram' : 'Email'}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 pr-4 hidden md:table-cell">
                            <div className="flex gap-1 flex-wrap">
                              {alert.severities.map((sev, si) => (
                                <span
                                  key={si}
                                  className={cn(
                                    'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono',
                                    sev === 'critical' ? 'bg-red-500/10 text-red-600' :
                                    sev === 'high' ? 'bg-orange-500/10 text-orange-600' :
                                    sev === 'medium' ? 'bg-yellow-500/10 text-yellow-600' :
                                    'bg-blue-500/10 text-blue-600'
                                  )}
                                >
                                  {sev === 'critical' ? 'C' : sev === 'high' ? 'A' : sev === 'medium' ? 'M' : 'B'}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 text-right text-muted-foreground whitespace-nowrap">
                            {formatDate(alert.sentAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  {alerts.length} alerta(s) enviada(s) en el período seleccionado
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══ Notification Config Dialog ═══════════════════════════

const DEFAULT_PATTERN_ALERT_CONFIG: PatternAlertConfig = {
  enabled: false,
  severities: ['critical', 'high'],
  channels: ['in_app'],
  patternTypes: [],
  cooldownMinutes: 60,
}

interface PatternAlertConfig {
  enabled: boolean
  severities: string[]
  channels: string[]
  patternTypes: string[]
  cooldownMinutes: number
}

function NotificationConfigDialog() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<PatternAlertConfig>(DEFAULT_PATTERN_ALERT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }> | null>(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/chatbot/analytics/notifications-config')
      if (res.ok) {
        const data = await res.json()
        setConfig({ ...DEFAULT_PATTERN_ALERT_CONFIG, ...data })
      }
    } catch (e) {
      console.error('Error loading notification config:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchConfig()
  }, [open, fetchConfig])

  const saveConfig = async () => {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/chatbot/analytics/notifications-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        toast.success('Configuración de notificaciones guardada')
        setOpen(false)
      } else {
        toast.error('Error al guardar configuración')
      }
    } catch (e) {
      toast.error('Error al guardar configuración')
    } finally {
      setSaving(false)
    }
  }

  const toggleSeverity = (sev: string) => {
    if (!config) return
    setConfig({
      ...config,
      severities: config.severities.includes(sev)
        ? config.severities.filter(s => s !== sev)
        : [...config.severities, sev],
    })
  }

  const toggleChannel = (ch: string) => {
    if (!config) return
    setConfig({
      ...config,
      channels: config.channels.includes(ch)
        ? config.channels.filter(c => c !== ch)
        : [...config.channels, ch],
    })
  }

  const severityBadge = (sev: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-500/15 text-red-600 border-red-300',
      high: 'bg-orange-500/15 text-orange-600 border-orange-300',
      medium: 'bg-yellow-500/15 text-yellow-600 border-yellow-300',
      low: 'bg-blue-500/15 text-blue-600 border-blue-300',
    }
    return (
      <button
        type="button"
        onClick={() => toggleSeverity(sev)}
        className={cn(
          'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
          config?.severities.includes(sev)
            ? colors[sev] || 'bg-primary/15 text-primary border-primary'
            : 'bg-muted text-muted-foreground border-border opacity-60 hover:opacity-100'
        )}
      >
        {sev === 'critical' ? 'Crítico' :
         sev === 'high' ? 'Alto' :
         sev === 'medium' ? 'Medio' : 'Bajo'}
      </button>
    )
  }

  const channelLabel = (ch: string) => {
    switch (ch) {
      case 'in_app': return { icon: Bell, label: 'In-App' }
      case 'telegram': return { icon: MessageSquare, label: 'Telegram' }
      case 'email': return { icon: MessageSquare, label: 'Email' }
      default: return { icon: Bell, label: ch }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-alert-config-trigger
          className={cn(
            'gap-2',
            config?.enabled && 'border-amber-400 text-amber-600 dark:text-amber-400'
          )}
        >
          {config?.enabled ? (
            <Bell className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
          Alertas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Alertas de Patrones Críticos
          </DialogTitle>
          <DialogDescription>
            Configura notificaciones automáticas cuando se detecten patrones anómalos en el chatbot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Notificaciones activas</Label>
              <p className="text-sm text-muted-foreground">
                Recibe alertas cuando se detecten patrones críticos
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
            />
          </div>

          <Separator />

          {/* Severity filter */}
          <div>
            <Label className="text-base font-medium">Severidad mínima</Label>
            <p className="text-sm text-muted-foreground mb-3">
              ¿Qué nivel de severidad debe tener un patrón para notificar?
            </p>
            <div className="flex flex-wrap gap-2">
              {severityBadge('critical')}
              {severityBadge('high')}
              {severityBadge('medium')}
              {severityBadge('low')}
            </div>
          </div>

          <Separator />

          {/* Channels */}
          <div>
            <Label className="text-base font-medium">Canales de notificación</Label>
            <p className="text-sm text-muted-foreground mb-3">
              ¿Cómo quieres recibir las alertas?
            </p>
            <div className="space-y-3">
              {['in_app', 'telegram', 'email'].map(ch => {
                const info = channelLabel(ch)
                const Icon = info.icon
                const enabled = config.channels.includes(ch)
                return (
                  <div
                    key={ch}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer',
                      enabled
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/50'
                    )}
                    onClick={() => toggleChannel(ch)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'p-1.5 rounded-lg',
                        enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{info.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {ch === 'in_app' ? 'Notificaciones dentro de la plataforma' :
                           ch === 'telegram' ? 'Mensaje via Telegram (requiere integración)' :
                           'Correo electrónico'}
                        </p>
                      </div>
                    </div>
                    <Switch checked={enabled} onCheckedChange={() => toggleChannel(ch)} />
                  </div>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Cooldown */}
          <div>
            <Label className="text-base font-medium">Enfriamiento</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Esperar antes de re-notificar sobre el mismo tipo de patrón
            </p>
            <select
              value={config.cooldownMinutes}
              onChange={(e) => setConfig({ ...config, cooldownMinutes: parseInt(e.target.value) })}
              className="border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full"
            >
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="60">1 hora</option>
              <option value="180">3 horas</option>
              <option value="360">6 horas</option>
              <option value="720">12 horas</option>
              <option value="1440">24 horas</option>
            </select>
          </div>
        </div>

        {/* Test results feedback */}
        {testResults && (
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              {Object.values(testResults).every(r => r.success) ? (
                <><CheckCircle className="h-4 w-4 text-emerald-500" /> Canales verificados</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-amber-500" /> Algunos canales fallaron</>
              )}
            </p>
            <div className="space-y-1.5">
              {Object.entries(testResults).map(([ch, result]) => (
                <div key={ch} className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium',
                    result.success
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-red-500/10 text-red-600'
                  )}>
                    {result.success ? '✅' : '❌'} {ch === 'in_app' ? 'In-App' : ch === 'telegram' ? 'Telegram' : 'Email'}
                  </span>
                  {result.error && (
                    <span className="text-muted-foreground">{result.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              setTesting(true)
              setTestResults(null)
              try {
                const res = await fetch('/api/chatbot/analytics/notifications-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(config),
                })
                if (res.ok) {
                  const data = await res.json()
                  setTestResults(data.results || {})
                  if (data.success) {
                    toast.success('Notificación de prueba enviada')
                  } else {
                    toast.error(data.message || 'Error al enviar prueba')
                  }
                } else {
                  toast.error('Error al enviar notificación de prueba')
                }
              } catch (e) {
                toast.error('Error de conexión')
              } finally {
                setTesting(false)
              }
            }}
            disabled={testing || !config.enabled}
            className="gap-2"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {testing ? 'Enviando...' : 'Probar notificaciones'}
          </Button>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setOpen(false); setTestResults(null) }}>
              Cerrar
            </Button>
            <Button onClick={saveConfig} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

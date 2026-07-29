'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  Share2, 
  Plus, 
  Calendar, 
  BarChart3, 
  Settings2, 
  Facebook, 
  Instagram, 
  Linkedin, 
  Youtube,
  Music,
  LayoutGrid,
  Clock,
  Send,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Link2,
  Link2Off
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Eye, Users, Heart, ArrowRight } from 'lucide-react'
import { PostCreator } from '@/components/social/PostCreator'
import { PostQueue } from '@/components/social/PostQueue'
import { SocialAnalyticsWidget } from '@/components/social/SocialAnalyticsWidget'
import { toast } from 'sonner'

export default function SocialDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [isCreatorOpen, setIsCreatorOpen] = useState(false)
  const [posts, setPosts] = useState<any[]>([])
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  const fetchPosts = async () => {
    try {
      setLoading(true)
      const [postsRes, configsRes] = await Promise.all([
        fetch('/api/social/posts'),
        fetch('/api/social/configs'),
      ])
      const postsData = await postsRes.json()
      const configsData = await configsRes.json()

      if (postsData.success) setPosts(postsData.posts)
      if (configsData.success) {
        const map: Record<string, any> = {}
        for (const c of configsData.configs) map[c.platform] = c
        setConfigs(map)
      }
    } catch (error) {
      console.error('Error fetching social data:', error)
      toast.error('Error al cargar datos del Hub Social')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPosts()
  }, [])

  return (
    <div className="flex flex-col gap-6 p-2 md:p-6 animate-in fade-in duration-700">
      {/* Header Premium */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Share2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Hub Social</h1>
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">Gestión de Presencia Omnicanal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setIsCreatorOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-6 font-bold shadow-md shadow-indigo-100 gap-2"
          >
            <Plus className="h-4 w-4" />
            Crear Publicación
          </Button>
          <Link href="/dashboard/social/settings">
            <Button variant="outline" className="rounded-xl h-11 w-11 p-0 border-slate-200" title="Configurar canales sociales">
              <Settings2 className="h-4 w-4 text-slate-500" />
            </Button>
          </Link>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100/50 p-1 rounded-2xl border border-slate-200/60 mb-6">
          <TabsTrigger value="overview" className="rounded-xl font-bold uppercase text-[10px] tracking-widest px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <LayoutGrid className="h-3.5 w-3.5 mr-2" />
            Vista General
          </TabsTrigger>
          <TabsTrigger value="queue" className="rounded-xl font-bold uppercase text-[10px] tracking-widest px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="h-3.5 w-3.5 mr-2" />
            Programados ({posts.filter(p => p.status === 'scheduled').length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-xl font-bold uppercase text-[10px] tracking-widest px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BarChart3 className="h-3.5 w-3.5 mr-2" />
            Estadísticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="rounded-3xl border-slate-200/60 shadow-sm overflow-hidden md:col-span-2">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-tighter">Canales Activos</CardTitle>
                  <CardDescription className="text-xs">Plataformas vinculadas a tu cuenta de Volkern</CardDescription>
                </div>
                <Link href="/dashboard/social/settings">
                  <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest gap-1.5 text-indigo-600 h-7">
                    <Settings2 className="h-3 w-3" />
                    Gestionar
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {[
                    { name: 'Facebook', id: 'facebook', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { name: 'Instagram', id: 'instagram', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50' },
                    { name: 'LinkedIn', id: 'linkedin', icon: Linkedin, color: 'text-sky-700', bg: 'bg-sky-50' },
                    { name: 'YouTube', id: 'youtube', icon: Youtube, color: 'text-red-600', bg: 'bg-red-50' },
                    { name: 'TikTok', id: 'tiktok', icon: Music, color: 'text-slate-900', bg: 'bg-slate-50' },
                  ].map((plat) => {
                    const config = configs[plat.id]
                    const connected = !!(config?.isActive && config?.profileId)
                    return (
                      <div key={plat.name} className={`p-4 rounded-2xl border flex items-center justify-between group transition-all ${
                        connected ? 'border-green-200 bg-green-50/30' : 'border-slate-100 hover:border-indigo-200'
                      }`}>
                        <div className="flex items-center gap-3">
                          {connected && config?.profileImage ? (
                            <img
                              src={config.profileImage}
                              alt={config.profileName}
                              className="h-10 w-10 rounded-xl object-cover border border-white shadow"
                            />
                          ) : (
                            <div className={`h-10 w-10 rounded-xl ${plat.bg} flex items-center justify-center`}>
                              <plat.icon className={`h-5 w-5 ${plat.color}`} />
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight">{plat.name}</p>
                            {connected ? (
                              <p className="text-[9px] font-bold text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="h-2.5 w-2.5" /> {config?.profileName || 'Conectado'}
                              </p>
                            ) : (
                              <p className="text-[9px] font-bold text-slate-400">SIN CONECTAR</p>
                            )}
                          </div>
                        </div>
                        <Link href="/dashboard/social/settings">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 ${
                              connected ? 'text-red-400 hover:bg-red-50' : 'text-indigo-600 hover:bg-indigo-50'
                            }`}
                            title={connected ? 'Desconectar' : 'Conectar'}
                          >
                            {connected ? <Link2Off className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                          </Button>
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats - Compact Summary */}
            <Card className="rounded-3xl border-slate-200/60 shadow-sm overflow-hidden md:col-span-1">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
                <CardTitle className="text-xs font-black uppercase tracking-tighter flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                  Resumen Rápido
                </CardTitle>
                <CardDescription className="text-[9px]">Métricas en vivo de tus canales</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Alcance</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">—</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Seguidores</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">—</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="h-3.5 w-3.5 text-rose-400" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Engagement</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">—</span>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setActiveTab('analytics')}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-[10px] font-black uppercase tracking-widest"
                  >
                    Ver Estadísticas Completas
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <Card className="rounded-3xl border-slate-200/60 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-sm font-black uppercase tracking-tighter">Actividad Reciente</CardTitle>
                    <CardDescription className="text-xs">Últimas publicaciones realizadas</CardDescription>
                  </div>
                  <Button variant="ghost" className="text-xs font-bold text-indigo-600 p-0 hover:bg-transparent">Ver todas</Button>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="p-8 text-center text-slate-400 italic text-xs">Cargando publicaciones...</div>
                  ) : posts.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center gap-4">
                       <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center">
                          <Share2 className="h-8 w-8 text-slate-200" />
                       </div>
                       <p className="text-sm text-slate-500 italic">No hay publicaciones recientes</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {posts.slice(0, 5).map(post => (
                        <div key={post.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                               {post.mediaUrls?.[0] ? <img src={post.mediaUrls[0]} alt="Post" className="h-full w-full object-cover" /> : <div className="text-slate-300">Aa</div>}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 truncate max-w-[200px]">{post.content}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {post.platforms.map((p: string) => (
                                  <Badge key={p} variant="secondary" className="capitalize text-[8px] px-1 h-3.5 font-black">{p}</Badge>
                                ))}
                                <span className="text-[9px] text-slate-400 font-bold uppercase">{new Date(post.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {post.status === 'published' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"><MoreVertical className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
             </Card>

             <Card className="rounded-3xl border-slate-200/60 shadow-sm border-t-4 border-t-amber-500">
                <CardHeader>
                   <CardTitle className="text-sm font-black uppercase tracking-tighter">Próximos Programados</CardTitle>
                   <CardDescription className="text-xs">No te pierdas de publicar contenido constante</CardDescription>
                </CardHeader>
                <CardContent>
                  <PostQueue posts={posts.filter(p => p.status === 'scheduled')} />
                </CardContent>
             </Card>
          </div>
        </TabsContent>

        <TabsContent value="queue">
          <PostQueue posts={posts.filter(p => p.status === 'scheduled')} full />
        </TabsContent>

        <TabsContent value="analytics" className="outline-none">
          <SocialAnalyticsWidget />
        </TabsContent>
      </Tabs>

      {/* Modales */}
      {isCreatorOpen && (
        <PostCreator 
          onClose={() => setIsCreatorOpen(false)} 
          onPostCreated={() => {
            fetchPosts()
            setIsCreatorOpen(false)
          }}
        />
      )}
    </div>
  )
}

'use client'

import { 
  Calendar, 
  Clock, 
  Trash2, 
  CheckCircle2, 
  Clock3, 
  AlertCircle,
  MoreHorizontal,
  Facebook,
  Instagram,
  Linkedin
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PostQueueProps {
  posts: any[]
  full?: boolean
}

export function PostQueue({ posts, full = false }: PostQueueProps) {
  if (posts.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 italic text-xs flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-slate-200" />
        </div>
        No hay publicaciones en esta sección
      </div>
    )
  }

  const getPlatformIcon = (p: string) => {
    switch (p) {
      case 'facebook': return <Facebook className="h-3 w-3 text-blue-600" />
      case 'instagram': return <Instagram className="h-3 w-3 text-pink-600" />
      case 'linkedin': return <Linkedin className="h-3 w-3 text-sky-700" />
      default: return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none text-[8px] font-black uppercase tracking-widest"><Clock3 className="h-2 w-2 mr-1" /> Programado</Badge>
      case 'published':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[8px] font-black uppercase tracking-widest"><CheckCircle2 className="h-2 w-2 mr-1" /> Publicado</Badge>
      case 'failed':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none text-[8px] font-black uppercase tracking-widest"><AlertCircle className="h-2 w-2 mr-1" /> Error</Badge>
      default:
        return <Badge variant="secondary" className="text-[8px] font-black uppercase tracking-widest">{status}</Badge>
    }
  }

  return (
    <div className={cn("space-y-4", full ? "p-4" : "")}>
      {posts.map((post) => (
        <div 
          key={post.id} 
          className="group relative bg-white p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all hover:shadow-md"
        >
          <div className="flex gap-4">
            {/* Thumbnail */}
            <div className="h-16 w-16 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
               {post.mediaUrls?.[0] ? (
                 <img src={post.mediaUrls[0]} alt="Post Thumbnail" className="h-full w-full object-cover" />
               ) : (
                 <span className="text-slate-300 font-bold text-xs">Txt</span>
               )}
            </div>

            {/* Content Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    {post.platforms.map((p: string) => (
                      <div key={p} className="h-5 w-5 rounded-md bg-slate-50 flex items-center justify-center border border-slate-100">
                        {getPlatformIcon(p)}
                      </div>
                    ))}
                    <div className="h-3 w-[1px] bg-slate-100 mx-1" />
                    {getStatusBadge(post.status)}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">
                  {post.content}
                </p>
              </div>

              <div className="flex items-center gap-4 mt-2">
                 <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <Calendar className="h-3 w-3" />
                    {post.scheduledFor ? new Date(post.scheduledFor).toLocaleDateString() : new Date(post.createdAt).toLocaleDateString()}
                 </div>
                 <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <Clock className="h-3 w-3" />
                    {post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 </div>
              </div>
            </div>
          </div>

          {/* Action Overlay for hover (Optional) */}
          {post.status === 'scheduled' && (
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
               <Button variant="destructive" size="icon" className="h-7 w-7 rounded-lg">
                  <Trash2 className="h-3.5 w-3.5" />
               </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Medal, Star, TrendingUp, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface LeaderboardEntry {
  userId: string;
  name: string;
  avatar: string | null;
  averageScore: number;
  maxScore: number;
  totalSessions: number;
}

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export const TrainingLeaderboard = () => {
  const { data, error, isLoading } = useSWR('/api/analytics/training/leaderboard', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000 // Cachear por 1 minuto
  });

  const leaderboard: LeaderboardEntry[] = data?.success ? data.data : [];
  const loading = isLoading;
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        ))}
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="text-center py-8 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
        <Trophy className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500 font-medium">Aún no hay datos de entrenamiento.</p>
        <p className="text-[10px] text-slate-400">Las sesiones de roleplay aparecerán aquí.</p>
      </div>
    );
  }

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 1: return <Medal className="w-5 h-5 text-slate-400" />;
      case 2: return <Medal className="w-5 h-5 text-amber-600" />;
      default: return <span className="text-sm font-bold text-slate-400">#{index + 1}</span>;
    }
  };

  return (
    <div className="space-y-3">
      {leaderboard.map((entry, index) => (
        <motion.div
          key={entry.userId}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: index * 0.1 }}
          className={`group relative p-4 rounded-2xl border transition-all hover:shadow-lg ${
            index === 0 
              ? 'bg-gradient-to-r from-yellow-50 to-white dark:from-yellow-900/10 dark:to-slate-900 border-yellow-200 dark:border-yellow-900/30' 
              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Posición / Icono */}
              <div className="w-8 flex justify-center">
                {getRankIcon(index)}
              </div>

              {/* Avatar */}
              <Avatar className="h-10 w-10 border-2 border-slate-100 dark:border-slate-800">
                <AvatarImage src={entry.avatar || undefined} />
                <AvatarFallback className="bg-slate-100 dark:bg-slate-800">
                  <UserIcon className="w-5 h-5 text-slate-400" />
                </AvatarFallback>
              </Avatar>

              {/* Info Agent */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {entry.name}
                  {index === 0 && (
                    <span className="text-[10px] bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full font-black uppercase">PRO</span>
                  )}
                </h4>
                <p className="text-[10px] text-slate-500 font-medium">
                  {entry.totalSessions} sesiones completadas
                </p>
              </div>
            </div>

            {/* Score Stats */}
            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-blue-600 dark:text-blue-400">
                <Star className="w-3 h-3 fill-current" />
                <span className="text-lg font-black">{entry.averageScore}</span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Promedio Cierre</p>
            </div>
          </div>

          {/* Progress bar sutil (solo en desktop) */}
          <div className="mt-3 h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${entry.averageScore}%` }}
              className="h-full bg-blue-500"
            />
          </div>
        </motion.div>
      ))}

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Basado en IA Analytics
        </span>
        <button className="hover:text-blue-600 transition-colors">Ver reporte completo</button>
      </div>
    </div>
  );
};

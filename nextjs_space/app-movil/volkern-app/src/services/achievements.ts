import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type AchievementCategory = 'tasks' | 'goals' | 'contacts' | 'surveys' | 'login' | 'social' | 'onboarding';
export type BadgeSize = 'small' | 'medium' | 'large';

export interface Achievement {
  id: string;
  key: string;
  category: AchievementCategory;
  tier: AchievementTier;
  label: string;
  description: string;
  icon: string;
  color: string;
  requirement: number;
  isSecret?: boolean;
}

export interface UserAchievement {
  achievementId: string;
  unlockedAt: string;
  progress: number; // 0-100
  completed: boolean;
}

export interface AchievementProgress {
  id: string;
  achievementId: string;
  current: number;
  target: number;
  label: string;
}

export interface Badge {
  id: string;
  icon: string;
  color: string;
  tier: AchievementTier;
  label: string;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  todayActive: boolean;
}

export interface GamificationProfile {
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalAchievements: number;
  completedAchievements: number;
  streaks: StreakData;
  badges: Badge[];
  recentProgress: AchievementProgress[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'volkern_achievements';
const XP_KEY = 'volkern_gamification_xp';
const STREAK_KEY = 'volkern_gamification_streak';

export const XP_PER_LEVEL = 500;
export const MAX_LEVEL = 50;

export const ACHIEVEMENT_TIER_CONFIG: Record<AchievementTier, { icon: string; color: string; labelKey: string }> = {
  bronze: { icon: 'shield-outline', color: '#CD7F32', labelKey: 'tierBronze' },
  silver: { icon: 'shield-checkmark-outline', color: '#C0C0C0', labelKey: 'tierSilver' },
  gold: { icon: 'shield-checkmark', color: '#FFD700', labelKey: 'tierGold' },
  platinum: { icon: 'diamond-outline', color: '#E5E4E2', labelKey: 'tierPlatinum' },
};

export const ACHIEVEMENTS: Achievement[] = [
  // ─── Tasks ──────────────────────────────────────────────────────────
  { id: 'task_first', key: 'taskFirst', category: 'tasks', tier: 'bronze', label: 'Primera Tarea', description: 'Completa tu primera tarea', icon: 'checkbox-outline', color: '#CD7F32', requirement: 1 },
  { id: 'task_ten', key: 'taskTen', category: 'tasks', tier: 'silver', label: 'Productivo', description: 'Completa 10 tareas', icon: 'checkbox', color: '#C0C0C0', requirement: 10 },
  { id: 'task_fifty', key: 'taskFifty', category: 'tasks', tier: 'gold', label: 'Máquina de Tareas', description: 'Completa 50 tareas', icon: 'checkbox', color: '#FFD700', requirement: 50 },
  { id: 'task_hundred', key: 'taskHundred', category: 'tasks', tier: 'platinum', label: 'Legacy del Trabajo', description: 'Completa 100 tareas', icon: 'trophy-outline', color: '#E5E4E2', requirement: 100 },

  // ─── Goals ──────────────────────────────────────────────────────────
  { id: 'goal_first', key: 'goalFirst', category: 'goals', tier: 'bronze', label: 'Primera Meta', description: 'Crea tu primera meta', icon: 'flag-outline', color: '#CD7F32', requirement: 1 },
  { id: 'goal_complete', key: 'goalComplete', category: 'goals', tier: 'silver', label: 'Meta Cumplida', description: 'Completa tu primera meta', icon: 'flag', color: '#C0C0C0', requirement: 1 },
  { id: 'goal_five', key: 'goalFive', category: 'goals', tier: 'gold', label: 'Visionario', description: 'Completa 5 metas', icon: 'trophy-outline', color: '#FFD700', requirement: 5 },

  // ─── Contacts ───────────────────────────────────────────────────────
  { id: 'contact_first', key: 'contactFirst', category: 'contacts', tier: 'bronze', label: 'Social', description: 'Agrega tu primer contacto', icon: 'person-add-outline', color: '#CD7F32', requirement: 1 },
  { id: 'contact_ten', key: 'contactTen', category: 'contacts', tier: 'silver', label: 'Networking', description: 'Agrega 10 contactos', icon: 'people-outline', color: '#C0C0C0', requirement: 10 },
  { id: 'contact_fifty', key: 'contactFifty', category: 'contacts', tier: 'gold', label: 'Influencer', description: 'Agrega 50 contactos', icon: 'people', color: '#FFD700', requirement: 50 },

  // ─── Surveys ────────────────────────────────────────────────────────
  { id: 'survey_first', key: 'surveyFirst', category: 'surveys', tier: 'bronze', label: 'Opinión', description: 'Responde tu primera encuesta', icon: 'chatbubble-outline', color: '#CD7F32', requirement: 1 },
  { id: 'survey_feedback', key: 'surveyFeedback', category: 'surveys', tier: 'silver', label: 'Feedback Pro', description: 'Envía 5 feedbacks', icon: 'chatbubbles-outline', color: '#C0C0C0', requirement: 5 },

  // ─── Login / Engagement ─────────────────────────────────────────────
  { id: 'login_week', key: 'loginWeek', category: 'login', tier: 'bronze', label: 'Constante', description: 'Inicia sesión 7 días seguidos', icon: 'calendar-outline', color: '#CD7F32', requirement: 7 },
  { id: 'login_month', key: 'loginMonth', category: 'login', tier: 'silver', label: 'Dedicado', description: 'Inicia sesión 30 días seguidos', icon: 'calendar', color: '#C0C0C0', requirement: 30 },
  { id: 'login_bimonthly', key: 'loginBimonthly', category: 'login', tier: 'gold', label: 'Fiel', description: 'Inicia sesión 60 días seguidos', icon: 'flame-outline', color: '#FFD700', requirement: 60 },
  { id: 'login_quarter', key: 'loginQuarter', category: 'login', tier: 'platinum', label: 'Imparable', description: 'Inicia sesión 90 días seguidos', icon: 'flame', color: '#E5E4E2', requirement: 90 },

  // ─── Social ─────────────────────────────────────────────────────────
  { id: 'share_profile', key: 'shareProfile', category: 'social', tier: 'bronze', label: 'Conectado', description: 'Comparte tu perfil', icon: 'share-outline', color: '#CD7F32', requirement: 1 },
  { id: 'qr_scan', key: 'qrScan', category: 'social', tier: 'silver', label: 'Explorador', description: 'Escanea tu primer código QR', icon: 'qr-code-outline', color: '#C0C0C0', requirement: 1 },

  // ─── Onboarding ─────────────────────────────────────────────────────
  { id: 'onboarding_complete', key: 'onboardingComplete', category: 'onboarding', tier: 'bronze', label: 'Bienvenido', description: 'Completa el onboarding', icon: 'sparkles-outline', color: '#CD7F32', requirement: 1, isSecret: true },
  { id: 'profile_complete', key: 'profileComplete', category: 'onboarding', tier: 'silver', label: 'Completo', description: 'Completa tu perfil al 100%', icon: 'person-outline', color: '#C0C0C0', requirement: 100 },
];

// ─── Service ──────────────────────────────────────────────────────────────────
class AchievementsService {
  /**
   * Get all achievements with user progress
   */
  async getAll(): Promise<(Achievement & { progress: number; unlockedAt: string | null; completed: boolean })[]> {
    const userAchievements = await this._getUserAchievements();
    return ACHIEVEMENTS.map((ach) => {
      const ua = userAchievements.find((u) => u.achievementId === ach.id);
      return {
        ...ach,
        progress: ua?.progress || 0,
        unlockedAt: ua?.unlockedAt || null,
        completed: ua?.completed || false,
      };
    });
  }

  /**
   * Get gamification profile (level, xp, streaks, badges)
   */
  async getProfile(): Promise<GamificationProfile> {
    const xpData = await this._getXP();
    const streakData = await this._getStreak();
    const userAchievements = await this._getUserAchievements();

    const completedIds = userAchievements.filter((u) => u.completed).map((u) => u.achievementId);
    const level = Math.min(Math.floor(xpData.xp / XP_PER_LEVEL) + 1, MAX_LEVEL);

    const badges: Badge[] = completedIds.map((id) => {
      const ach = ACHIEVEMENTS.find((a) => a.id === id)!;
      return {
        id: ach.id,
        icon: ACHIEVEMENT_TIER_CONFIG[ach.tier].icon,
        color: ACHIEVEMENT_TIER_CONFIG[ach.tier].color,
        tier: ach.tier,
        label: ach.label,
      };
    });

    const recentProgress = userAchievements
      .filter((u) => !u.completed && u.progress > 0)
      .map((u) => {
        const ach = ACHIEVEMENTS.find((a) => a.id === u.achievementId)!;
        return { id: u.achievementId, achievementId: u.achievementId, current: u.progress, target: ach.requirement, label: ach.label };
      });

    return {
      level,
      xp: xpData.xp,
      xpToNextLevel: level >= MAX_LEVEL ? 0 : XP_PER_LEVEL,
      totalAchievements: ACHIEVEMENTS.length,
      completedAchievements: completedIds.length,
      streaks: streakData,
      badges,
      recentProgress,
    };
  }

  /**
   * Record progress for an achievement
   */
  async recordProgress(achievementKey: string, increment: number = 1): Promise<void> {
    const ach = ACHIEVEMENTS.find((a) => a.key === achievementKey);
    if (!ach) return;

    let userAchievements = await this._getUserAchievements();
    let ua = userAchievements.find((u) => u.achievementId === ach.id);

    if (!ua) {
      ua = { achievementId: ach.id, unlockedAt: '', progress: 0, completed: false };
      userAchievements.push(ua);
    }

    if (ua.completed) return; // Already unlocked

    ua.progress = Math.min(ua.progress + increment, ach.requirement);
    if (ua.progress >= ach.requirement) {
      ua.completed = true;
      ua.unlockedAt = new Date().toISOString();
      await this._addXP(100); // XP reward for unlocking
    }

    await this._saveUserAchievements(userAchievements);
  }

  /**
   * Add XP points
   */
  async addXP(amount: number): Promise<void> {
    await this._addXP(amount);
  }

  /**
   * Record daily activity (for streaks)
   */
  async recordDailyActivity(): Promise<void> {
    const streak = await this._getStreak();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (streak.lastActiveDate === today) {
      streak.todayActive = true;
    } else if (streak.lastActiveDate === yesterday) {
      streak.currentStreak += 1;
      streak.todayActive = true;
      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }
    } else {
      streak.currentStreak = 1;
      streak.todayActive = true;
      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }
    }

    streak.lastActiveDate = today;
    await this._saveStreak(streak);

    // Check streak achievements
    if (streak.currentStreak >= 7) await this.recordProgress('loginWeek');
    if (streak.currentStreak >= 30) await this.recordProgress('loginMonth');
    if (streak.currentStreak >= 60) await this.recordProgress('loginBimonthly');
    if (streak.currentStreak >= 90) await this.recordProgress('loginQuarter');

    // Daily XP
    await this._addXP(10);
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private async _getXP(): Promise<{ xp: number }> {
    try {
      const raw = await SecureStore.getItemAsync(XP_KEY);
      return raw ? JSON.parse(raw) : { xp: 0 };
    } catch {
      return { xp: 0 };
    }
  }

  private async _addXP(amount: number): Promise<void> {
    const data = await this._getXP();
    data.xp += amount;
    await SecureStore.setItemAsync(XP_KEY, JSON.stringify(data));
  }

  private async _getStreak(): Promise<StreakData> {
    try {
      const raw = await SecureStore.getItemAsync(STREAK_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: '', todayActive: false };
  }

  private async _saveStreak(data: StreakData): Promise<void> {
    await SecureStore.setItemAsync(STREAK_KEY, JSON.stringify(data));
  }

  private async _getUserAchievements(): Promise<UserAchievement[]> {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async _saveUserAchievements(data: UserAchievement[]): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data));
  }
}

export const achievementsService = new AchievementsService();

// ─── Navegación ───────────────────────────────────────────────────────────────
export type RootStackParamList = {
  '(tabs)': undefined;
  'auth/login': undefined;
};

export type TabParamList = {
  index: undefined;
  gemma: undefined;
  notifications: undefined;
  hubs: undefined;
  profile: undefined;
};

// ─── Módulos / Hubs ──────────────────────────────────────────────────────────
export interface HubCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  moduleCount: number;
}

export interface HubModule {
  id: string;
  name: string;
  icon: string;
  color: string;
  categoryId: string;
  categoryName: string;
  hubHref: string;
  description: string;
}

// ─── Notificaciones ───────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  type: 'lead' | 'cita' | 'message' | 'system' | 'task' | 'alert';
  title: string;
  body: string;
  read: boolean;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ─── Leads ────────────────────────────────────────────────────────────────────
export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  status: 'new' | 'contacted' | 'qualified' | 'lost' | 'won';
  score?: number;
  assignedTo?: string;
  createdAt: string;
  notes?: string;
}

// ─── Citas ────────────────────────────────────────────────────────────────────
export interface Cita {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  client: string;
  clientId?: string;
  type: 'call' | 'meeting' | 'demo' | 'followup';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
}

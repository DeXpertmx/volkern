import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_health';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HealthService {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  responseTime: number;
  lastChecked: string;
}

export interface HealthCheck {
  id: string;
  timestamp: string;
  services: HealthService[];
  allHealthy: boolean;
}

export interface HealthIssue {
  id: string;
  serviceId: string;
  serviceName: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DEFAULT_SERVICES: HealthService[] = [
  { id: 'db', name: 'Database', status: 'healthy', uptime: '99.9%', responseTime: 45, lastChecked: new Date().toISOString() },
  { id: 'api', name: 'API', status: 'healthy', uptime: '99.8%', responseTime: 120, lastChecked: new Date().toISOString() },
  { id: 'storage', name: 'Storage', status: 'healthy', uptime: '100%', responseTime: 30, lastChecked: new Date().toISOString() },
  { id: 'cache', name: 'Cache', status: 'healthy', uptime: '99.9%', responseTime: 5, lastChecked: new Date().toISOString() },
];

export const healthService = {
  async getStatus(): Promise<{ services: HealthService[]; allHealthy: boolean }> {
    const saved = await getData<{ services: HealthService[] }>(STORAGE_KEY);
    const services = saved?.services || DEFAULT_SERVICES.map(s => ({
      ...s,
      lastChecked: new Date().toISOString(),
    }));
    return {
      services,
      allHealthy: services.every(s => s.status === 'healthy'),
    };
  },

  async checkNow(): Promise<{ services: HealthService[]; allHealthy: boolean }> {
    // Simulate health check
    const services: HealthService[] = DEFAULT_SERVICES.map(s => ({
      ...s,
      responseTime: Math.floor(Math.random() * 200) + 5,
      lastChecked: new Date().toISOString(),
      status: Math.random() > 0.9 ? 'degraded' : 'healthy',
    }));
    // Ensure at least 'healthy' most of the time
    const allHealthy = services.every(s => s.status === 'healthy');
    await saveData(STORAGE_KEY, { services });
    return { services, allHealthy };
  },

  async getIssues(): Promise<HealthIssue[]> {
    const saved = await getData<HealthIssue[]>(STORAGE_KEY + '_issues');
    return saved || [];
  },

  async resolveIssue(id: string): Promise<void> {
    const issues = await this.getIssues();
    const idx = issues.findIndex(i => i.id === id);
    if (idx === -1) return;
    issues[idx].status = 'resolved';
    issues[idx].resolvedAt = new Date().toISOString();
    await saveData(STORAGE_KEY + '_issues', issues);
  },

  async getHistory(): Promise<HealthCheck[]> {
    const saved = await getData<HealthCheck[]>(STORAGE_KEY + '_history');
    return saved || [];
  },
};

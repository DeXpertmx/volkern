import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_integrations';

// ─── Types ────────────────────────────────────────────────────────────────────
export type IntegrationStatus = 'connected' | 'error' | 'pending';
export type IntegrationProvider =
  | 'google_drive' | 'dropbox' | 'slack' | 'notion'
  | 'zapier' | 'make' | 'hubspot' | 'salesforce'
  | 'mailchimp' | 'stripe' | 'zoho' | 'custom_webhook';

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: IntegrationStatus;
  config: Record<string, string>;
  lastSync: string | null;
  createdAt: string;
  updatedAt: string;
}

export const AVAILABLE_INTEGRATIONS: { provider: IntegrationProvider; name: string; description: string; icon: string; color: string }[] = [
  { provider: 'google_drive', name: 'Google Drive', description: 'Cloud storage & docs', icon: 'logo-google', color: '#4285F4' },
  { provider: 'dropbox', name: 'Dropbox', description: 'File hosting service', icon: 'cloud', color: '#0061FF' },
  { provider: 'slack', name: 'Slack', description: 'Team messaging', icon: 'chatbubbles', color: '#4A154B' },
  { provider: 'notion', name: 'Notion', description: 'Docs & wikis', icon: 'document-text', color: '#000000' },
  { provider: 'zapier', name: 'Zapier', description: 'Automation platform', icon: 'flash', color: '#FF4A00' },
  { provider: 'make', name: 'Make', description: 'Visual automation', icon: 'cog', color: '#6C47FF' },
  { provider: 'hubspot', name: 'HubSpot', description: 'CRM & marketing', icon: 'people', color: '#FF7A59' },
  { provider: 'salesforce', name: 'Salesforce', description: 'Enterprise CRM', icon: 'cloud', color: '#00A1E0' },
  { provider: 'mailchimp', name: 'Mailchimp', description: 'Email marketing', icon: 'mail', color: '#FFE01B' },
  { provider: 'stripe', name: 'Stripe', description: 'Payment processing', icon: 'card', color: '#635BFF' },
  { provider: 'zoho', name: 'Zoho', description: 'Business suite', icon: 'briefcase', color: '#E42527' },
  { provider: 'custom_webhook', name: 'Custom Webhook', description: 'Custom HTTP endpoint', icon: 'code-slash', color: '#64748B' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const integrationsService = {
  async getAll(): Promise<Integration[]> {
    const items = await getData<Integration[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<Integration | null> {
    const items = await this.getAll();
    return items.find(i => i.id === id) || null;
  },

  async connect(provider: IntegrationProvider, config: Record<string, string>): Promise<Integration> {
    const items = await this.getAll();
    const existing = items.find(i => i.provider === provider);
    if (existing) {
      existing.status = 'connected';
      existing.config = { ...existing.config, ...config };
      existing.updatedAt = new Date().toISOString();
      await saveData(STORAGE_KEY, items);
      return existing;
    }
    const def = AVAILABLE_INTEGRATIONS.find(a => a.provider === provider)!;
    const now = new Date().toISOString();
    const item: Integration = {
      id: generateId(),
      provider,
      name: def.name,
      description: def.description,
      icon: def.icon,
      color: def.color,
      status: 'connected',
      config,
      lastSync: now,
      createdAt: now,
      updatedAt: now,
    };
    items.push(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async disconnect(id: string): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    items.splice(idx, 1);
    await saveData(STORAGE_KEY, items);
  },

  async updateConfig(id: string, config: Record<string, string>): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Integration not found');
    items[idx].config = { ...items[idx].config, ...config };
    items[idx].updatedAt = new Date().toISOString();
    await saveData(STORAGE_KEY, items);
  },

  async sync(id: string): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    items[idx].lastSync = new Date().toISOString();
    items[idx].status = 'connected';
    await saveData(STORAGE_KEY, items);
  },
};

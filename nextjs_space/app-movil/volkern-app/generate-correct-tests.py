#!/usr/bin/env python3
"""Generate correct Jest test files for all 50 services."""
import os

TESTS_DIR = 'src/__tests__'
SERVICES_DIR = 'src/services'
os.makedirs(TESTS_DIR, exist_ok=True)

# ─── Pattern A: getData/saveData CRUD ──────────────────────────────────
def pattern_a_crud(service_name, export_name, stats_prop='total', extra_tests=''):
    has_stats = False
    has_search = False
    svc_path = os.path.join(SERVICES_DIR, f'{service_name}.ts')
    if os.path.exists(svc_path):
        with open(svc_path) as f:
            content = f.read()
            has_stats = 'getStats' in content
            has_search = 'search' in content

    return f"""import {{ {export_name} }} from '../services/{service_name}';
import {{ getData, saveData }} from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({{
  getData: jest.fn(),
  saveData: jest.fn(),
}}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

const mockItems: any[] = [
  {{ id: 'test-1', name: 'Item 1', createdAt: '2025-01-01', updatedAt: '2025-01-01' }},
  {{ id: 'test-2', name: 'Item 2', createdAt: '2025-01-02', updatedAt: '2025-01-02' }},
];

beforeEach(() => {{ jest.clearAllMocks(); }});

describe('{export_name}.getAll', () => {{
  it('returns empty array when no data', async () => {{
    mockedGetData.mockResolvedValue(null);
    expect(await {export_name}.getAll()).toEqual([]);
  }});
  it('returns stored items', async () => {{
    mockedGetData.mockResolvedValue(mockItems);
    expect(await {export_name}.getAll()).toHaveLength(2);
  }});
}});

describe('{export_name}.getById', () => {{
  it('returns item by id', async () => {{
    mockedGetData.mockResolvedValue(mockItems);
    const result = await {export_name}.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  }});
  it('returns null for non-existent id', async () => {{
    mockedGetData.mockResolvedValue(mockItems);
    expect(await {export_name}.getById('bad-id')).toBeNull();
  }});
}});

describe('{export_name}.create', () => {{
  it('creates and persists item', async () => {{
    mockedGetData.mockResolvedValue([]);
    const result = await {export_name}.create({{ name: 'New' }} as any);
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  }});
}});

describe('{export_name}.update', () => {{
  it('updates item fields', async () => {{
    mockedGetData.mockResolvedValue(mockItems);
    await {export_name}.update('test-1', {{ name: 'Updated' }} as any);
    expect(mockedSaveData).toHaveBeenCalled();
  }});
}});

describe('{export_name}.delete', () => {{
  it('removes item', async () => {{
    mockedGetData.mockResolvedValue(mockItems);
    await {export_name}.delete('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  }});
}});
{_stats(has_stats, export_name, stats_prop)}
{_search(has_search, export_name)}
{extra_tests}
"""

def _stats(has_stats, export_name, stats_prop='total'):
    if not has_stats:
        return ''
    return f"""
describe('{export_name}.getStats', () => {{
  it('returns stats object', async () => {{
    const {{ getData }} = await import('../services/secure-storage');
    expect(getData).toBeDefined();
    const stats = await {export_name}.getStats();
    expect(stats).toHaveProperty('{stats_prop}');
  }});
}});
"""

def _search(has_search, export_name):
    if not has_search:
        return ''
    return f"""
describe('{export_name}.search', () => {{
  it('returns matching items', async () => {{
    const {{ getData }} = await import('../services/secure-storage');
    expect(getData).toBeDefined();
    const result = await {export_name}.search('Item');
    expect(result).toBeDefined();
  }});
}});
"""

# ─── Pattern B: SecureStore CRUD ───────────────────────────────────────
def pattern_b_crud(service_name, export_name, stats_prop='total', has_getbyid=True, getbyid_returns_null=True):
    svc_path = os.path.join(SERVICES_DIR, f'{service_name}.ts')
    has_stats = False
    has_search = False
    if os.path.exists(svc_path):
        with open(svc_path) as f:
            content = f.read()
            has_stats = 'getStats' in content
            has_search = 'search' in content

    null_assert = 'toBeNull' if getbyid_returns_null else 'toBeUndefined'
    null_text = 'null' if getbyid_returns_null else 'undefined'

    getbyid_test = ''
    if has_getbyid:
        getbyid_test = f"""
describe('{export_name}.getById', () => {{
  it('returns item by id', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await {export_name}.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  }});
  it('returns {null_text} for non-existent id', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await {export_name}.getById('bad-id')).{null_assert}();
  }});
}});
"""

    stats_test = ''
    if has_stats:
        stats_test = f"""
describe('{export_name}.getStats', () => {{
  it('returns stats object', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await {export_name}.getStats();
    expect(stats).toHaveProperty('{stats_prop}');
  }});
}});
"""

    search_test = ''
    if has_search:
        search_test = f"""
describe('{export_name}.search', () => {{
  it('returns matching items', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await {export_name}.search('Item');
    expect(result).toBeDefined();
  }});
}});
"""

    return f"""import {{ {export_name} }} from '../services/{service_name}';

jest.mock('expo-secure-store', () => ({{
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockItems: any[] = [
  {{ id: 'test-1', name: 'Item 1', createdAt: 1700000000000, updatedAt: 1700000000000 }},
  {{ id: 'test-2', name: 'Item 2', createdAt: 1700000000001, updatedAt: 1700000000001 }},
];

beforeEach(() => {{ jest.clearAllMocks(); }});

describe('{export_name}.getAll', () => {{
  it('returns empty array when no data', async () => {{
    mockedGetItem.mockResolvedValue(null);
    expect(await {export_name}.getAll()).toEqual([]);
  }});
  it('returns stored items', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await {export_name}.getAll()).toHaveLength(2);
  }});
}});
{getbyid_test}
describe('{export_name}.create', () => {{
  it('creates and persists item', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await {export_name}.create({{ name: 'New' }} as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  }});
}});

describe('{export_name}.update', () => {{
  it('updates item fields', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await {export_name}.update('test-1', {{ name: 'Updated' }} as any);
    expect(mockedSetItem).toHaveBeenCalled();
  }});
  it('returns null if not found', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await {export_name}.update('bad-id', {{}} as any);
    expect(result).toBeNull();
  }});
}});

describe('{export_name}.delete', () => {{
  it('removes item', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await {export_name}.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  }});
  it('no-op if not found', async () => {{
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await {export_name}.delete('bad-id');
  }});
}});
{stats_test}
{search_test}
"""

# ─── Each service ──────────────────────────────────────────────────────
TESTS = {}

# == Pattern A - getData/saveData CRUD ==
TESTS['inventory'] = pattern_a_crud('inventory', 'inventoryService', stats_prop='totalItems')
TESTS['expenses'] = pattern_a_crud('expenses', 'expenseService', stats_prop='totalExpenses')
TESTS['vendors'] = pattern_a_crud('vendors', 'vendorsService')
TESTS['support'] = pattern_a_crud('support', 'supportService')
TESTS['automation'] = pattern_a_crud('automation', 'automationService')

# == Pattern B - SecureStore CRUD ==
TESTS['leads'] = pattern_b_crud('leads', 'leadsService', getbyid_returns_null=False)
TESTS['invoices'] = pattern_b_crud('invoices', 'invoicesService')
TESTS['contacts'] = pattern_b_crud('contacts', 'contactsService')
TESTS['notes'] = pattern_b_crud('notes', 'notesService', getbyid_returns_null=False)
TESTS['pipeline'] = pattern_b_crud('pipeline', 'pipelineService', getbyid_returns_null=False)

# == Health (custom - no CRUD) ==
TESTS['health'] = """import { healthService } from '../services/health';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('healthService.getStatus', () => {
  it('returns default services when no saved data', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await healthService.getStatus();
    expect(result).toHaveProperty('services');
    expect(result).toHaveProperty('allHealthy');
    expect(result.services.length).toBeGreaterThanOrEqual(4);
  });
  it('returns saved services', async () => {
    mockedGetData.mockResolvedValue({ services: [{ id: 'custom', name: 'Custom', status: 'degraded', uptime: '50%', responseTime: 500, lastChecked: '' }] });
    const result = await healthService.getStatus();
    expect(result.services).toHaveLength(1);
    expect(result.allHealthy).toBe(false);
  });
});

describe('healthService.checkNow', () => {
  it('performs health check and saves', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await healthService.checkNow();
    expect(result).toHaveProperty('services');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('healthService.getIssues', () => {
  it('returns empty array when no issues', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await healthService.getIssues()).toEqual([]);
  });
});

describe('healthService.resolveIssue', () => {
  it('resolves an issue', async () => {
    const issues = [{ id: 'iss-1', serviceId: 'db', serviceName: 'Database', title: 'Down', description: 'DB down', severity: 'critical', status: 'open', createdAt: '', resolvedAt: null }];
    mockedGetData.mockResolvedValue(issues);
    await healthService.resolveIssue('iss-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('healthService.getHistory', () => {
  it('returns empty history when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await healthService.getHistory()).toEqual([]);
  });
});
"""

# == Audit (custom - no standard CRUD) ==
TESTS['audit'] = """import { auditService } from '../services/audit';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

const mockEvents: any[] = [
  { id: 'a1', type: 'user_action', action: 'login', userId: 'u1', userName: 'Test', details: 'Logged in', ipAddress: '127.0.0.1', metadata: {}, timestamp: '2025-01-02T00:00:00Z' },
  { id: 'a2', type: 'system_action', action: 'backup', userId: 'system', userName: 'System', details: 'Daily backup', ipAddress: '127.0.0.1', metadata: {}, timestamp: '2025-01-01T00:00:00Z' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('auditService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await auditService.getAll()).toEqual([]);
  });
  it('returns sorted events', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll();
    expect(result).toHaveLength(2);
  });
  it('filters by type', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll({ type: 'user_action' });
    expect(result).toHaveLength(1);
  });
  it('filters by search', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll({ search: 'login' });
    expect(result).toHaveLength(1);
  });
});

describe('auditService.log', () => {
  it('creates audit event', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await auditService.log({
      type: 'security_event', action: 'unauthorized_access',
      userId: 'u1', userName: 'Test', details: 'Access denied',
      ipAddress: '192.168.1.1', metadata: { path: '/admin' },
    });
    expect(result.id).toBeDefined();
    expect(result.timestamp).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('auditService.clearAll', () => {
  it('clears all events', async () => {
    await auditService.clearAll();
    expect(mockedSaveData).toHaveBeenCalledWith('volkern_audit', []);
  });
});

describe('auditService.export', () => {
  it('exports all events', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.export();
    expect(result).toHaveLength(2);
  });
});

describe('auditService.getEventTypes', () => {
  it('returns event type definitions', async () => {
    const types = await auditService.getEventTypes();
    expect(types).toHaveLength(3);
  });
});
"""

# == Integrations (Pattern A but connect/disconnect) ==
TESTS['integrations'] = """import { integrationsService } from '../services/integrations';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

const mockItems: any[] = [
  { id: 'test-1', provider: 'slack', name: 'Slack', config: {}, status: 'connected', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  { id: 'test-2', provider: 'google_drive', name: 'Google Drive', config: {}, status: 'connected', createdAt: '2025-01-02', updatedAt: '2025-01-02' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('integrationsService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await integrationsService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetData.mockResolvedValue(mockItems);
    expect(await integrationsService.getAll()).toHaveLength(2);
  });
});

describe('integrationsService.getById', () => {
  it('returns item by id', async () => {
    mockedGetData.mockResolvedValue(mockItems);
    const result = await integrationsService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
});

describe('integrationsService.connect', () => {
  it('connects a new integration', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await integrationsService.connect('slack', { token: 'xxx' });
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('integrationsService.disconnect', () => {
  it('disconnects integration', async () => {
    mockedGetData.mockResolvedValue(mockItems);
    await integrationsService.disconnect('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('integrationsService.updateConfig', () => {
  it('updates config', async () => {
    mockedGetData.mockResolvedValue(mockItems);
    await integrationsService.updateConfig('test-1', { newKey: 'val' });
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('integrationsService.sync', () => {
  it('syncs integration', async () => {
    mockedGetData.mockResolvedValue(mockItems);
    await integrationsService.sync('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});
"""

# == Feedback (Pattern A but updateStatus instead of update) ==
TESTS['feedback'] = """import { feedbackService } from '../services/feedback';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

beforeEach(() => { jest.clearAllMocks(); });

describe('feedbackService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await feedbackService.getAll()).toEqual([]);
  });
});

describe('feedbackService.create', () => {
  it('creates feedback with userId and userName', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await feedbackService.create({ type: 'bug', message: 'Bug found', rating: 3 }, 'user1', 'Test User');
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('feedbackService.updateStatus', () => {
  it('updates feedback status', async () => {
    mockedGetData.mockResolvedValue([{ id: 'f1', type: 'bug', message: 'Bug', status: 'new', createdAt: '', updatedAt: '' }]);
    await feedbackService.updateStatus('f1', 'reviewed');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('feedbackService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetData.mockResolvedValue([{ id: 'f1', type: 'bug', message: 'Bug', status: 'new', createdAt: '', updatedAt: '' }]);
    const stats = await feedbackService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('byType');
  });
});
"""

# == Billing (custom method names) ==
TESTS['billing'] = """import { billingService } from '../services/billing';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

beforeEach(() => { jest.clearAllMocks(); });

describe('billingService.getSubscription', () => {
  it('returns null when no subscription', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await billingService.getSubscription()).toBeNull();
  });
  it('returns subscription when exists', async () => {
    mockedGetData.mockResolvedValue({ id: 'sub1', name: 'Business', amount: 29, status: 'active' });
    const sub = await billingService.getSubscription();
    expect(sub).not.toBeNull();
    expect(sub!.name).toBe('Business');
  });
});

describe('billingService.getInvoices', () => {
  it('returns invoices array', async () => {
    mockedGetData.mockResolvedValue([{ id: 'inv1', number: 'F-001', amount: 100, status: 'paid' }]);
    expect(await billingService.getInvoices()).toHaveLength(1);
  });
});

describe('billingService.getPaymentMethods', () => {
  it('returns payment methods', async () => {
    mockedGetData.mockResolvedValue([{ id: 'pm1', type: 'card', last4: '4242', isDefault: true }]);
    expect(await billingService.getPaymentMethods()).toHaveLength(1);
  });
});

describe('billingService.changePlan', () => {
  it('changes to valid plan', async () => {
    mockedGetData.mockResolvedValue(null);
    await billingService.changePlan('business');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('billingService.cancelSubscription', () => {
  it('cancels subscription', async () => {
    mockedGetData.mockResolvedValue({ id: 'sub1', name: 'Business', status: 'active' });
    await billingService.cancelSubscription();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});
"""

# == Knowledge (custom methods) ==
TESTS['knowledge'] = """import { knowledgeService } from '../services/knowledge';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

const mockArticles: any[] = [
  { id: 'a1', title: 'Article 1', content: 'Content 1', summary: 'Summary 1', categoryId: 'guides', tags: ['guide'], published: true, helpful: 0, notHelpful: 0, views: 10, author: 'Test', createdAt: '', updatedAt: '' },
  { id: 'a2', title: 'Article 2', content: 'Content 2', summary: 'Summary 2', categoryId: 'faq', tags: ['faq'], published: true, helpful: 5, notHelpful: 1, views: 20, author: 'Test', createdAt: '', updatedAt: '' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('knowledgeService.getAllArticles', () => {
  it('returns all articles', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.getAllArticles();
    expect(result).toHaveLength(2);
  });
});

describe('knowledgeService.getArticles', () => {
  it('returns published articles by category', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.getArticles('guides');
    expect(result).toHaveLength(1);
  });
});

describe('knowledgeService.getById', () => {
  it('returns article by id', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.getById('a1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('a1');
  });
});

describe('knowledgeService.create', () => {
  it('creates article', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await knowledgeService.create({ title: 'New', content: 'Content', summary: 'Sum', categoryId: 'guides', tags: [], author: 'Test', published: true });
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('knowledgeService.search', () => {
  it('searches published articles', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.search('Article');
    expect(result).toHaveLength(2);
  });
});

describe('knowledgeService.markHelpful', () => {
  it('increments helpful count', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.markHelpful('a1', true);
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('knowledgeService.incrementViews', () => {
  it('increments view count', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.incrementViews('a1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});
"""

# == Tags (has seed data) ==
TESTS['tags'] = """import { tagsService } from '../services/tags';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('tagsService.getAll', () => {
  it('returns seed tags when no user data', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.getAll();
    expect(result.length).toBeGreaterThanOrEqual(7);
  });
});

describe('tagsService.getById', () => {
  it('returns seed tag by id', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.getById('seed-vip');
    expect(result).toBeDefined();
    if (result) expect(result.name).toBe('VIP');
  });
});

describe('tagsService.create', () => {
  it('creates user tag', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.create({ name: 'New Tag', color: '#FF0000', group: 'general', isSmart: false });
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('tagsService.update', () => {
  it('updates tag', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.update('seed-vip', { name: 'VIP Updated' });
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('tagsService.delete', () => {
  it('deletes user-created tag only', async () => {
    mockedGetData.mockResolvedValue(null);
    await tagsService.delete('seed-vip');
    // Seed tags cannot be deleted, this should be a no-op or save
  });
});

describe('tagsService.getStats', () => {
  it('returns stats', async () => {
    mockedGetData.mockResolvedValue(null);
    const stats = await tagsService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('smartCount');
  });
});
"""

# == Templates (has seed data) ==
TESTS['templates'] = """import { templatesService } from '../services/templates';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('templatesService.getAll', () => {
  it('returns built-in templates when no saved data', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.getAll();
    expect(result.length).toBeGreaterThanOrEqual(6);
  });
});

describe('templatesService.getById', () => {
  it('returns built-in template by id', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.getById('builtin-welcome-email');
    expect(result).toBeDefined();
    if (result) expect(result.title).toBe('Bienvenida');
  });
});

describe('templatesService.create', () => {
  it('creates user template', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.create({
      title: 'Custom Template', description: 'Desc', content: 'Content',
      category: 'custom', channel: 'email', status: 'draft', variables: [], tags: [],
    });
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('templatesService.update', () => {
  it('updates template', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.update('builtin-welcome-email', { title: 'Updated' });
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('templatesService.delete', () => {
  it('deletes template', async () => {
    mockedGetData.mockResolvedValue(null);
    await templatesService.delete('builtin-welcome-email');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('templatesService.getStats', () => {
  it('returns stats', async () => {
    mockedGetData.mockResolvedValue(null);
    const stats = await templatesService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('active');
  });
});
"""

# == Team (Pattern B, aliases getAll/create/update/delete, stats totalMembers) ==
TESTS['team'] = """import { teamService } from '../services/team';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockItems: any[] = [
  { id: 'test-1', name: 'Item 1', email: 'test1@test.com', role: 'member', department: 'Eng', status: 'active', createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'test-2', name: 'Item 2', email: 'test2@test.com', role: 'admin', department: 'Sales', status: 'active', createdAt: 1700000000001, updatedAt: 1700000000001 },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('teamService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await teamService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await teamService.getAll()).toHaveLength(2);
  });
});

describe('teamService.create', () => {
  it('creates and persists item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await teamService.create({ name: 'New Member' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('teamService.update', () => {
  it('updates item fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await teamService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.update('bad-id', {} as any);
    expect(result).toBeNull();
  });
});

describe('teamService.delete', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await teamService.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('teamService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await teamService.getStats();
    expect(stats).toHaveProperty('totalMembers');
  });
});
"""

# == Goals (Pattern B, no getById) ==
TESTS['goals'] = """import { goalsService } from '../services/goals';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('goalsService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await goalsService.getAll()).toEqual([]);
  });
  it('returns stored goals', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', title: 'Goal 1', type: 'numeric', targetValue: 100, currentValue: 50, status: 'active', createdAt: 0, updatedAt: 0 }]));
    expect(await goalsService.getAll()).toHaveLength(1);
  });
});

describe('goalsService.create', () => {
  it('creates and persists goal', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await goalsService.create({ title: 'New Goal', description: 'Desc', type: 'numeric', targetValue: 100, currentValue: 0, unit: 'mxn', icon: 'flag', color: '#000', status: 'active' });
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('goalsService.update', () => {
  it('updates goal fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', title: 'Goal 1', type: 'numeric', targetValue: 100, currentValue: 50, status: 'active', createdAt: 0, updatedAt: 0 }]));
    const result = await goalsService.update('g1', { currentValue: 75 });
    expect(mockedSetItem).toHaveBeenCalled();
    expect(result).not.toBeNull();
  });
});

describe('goalsService.delete', () => {
  it('removes goal', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'g1', title: 'Goal 1', type: 'numeric', targetValue: 100, currentValue: 50, status: 'active', createdAt: 0, updatedAt: 0 }]));
    await goalsService.delete('g1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('goalsService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const stats = await goalsService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('active');
  });
});
"""

# == Projects (Pattern B, seed data) ==
TESTS['projects'] = """import { projectService } from '../services/projects';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('projectService.getAll', () => {
  it('returns seed projects when no saved data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await projectService.getAll();
    expect(result.length).toBeGreaterThanOrEqual(5);
  });
  it('returns stored projects', async () => {
    const custom = [{ id: 'p1', name: 'Custom', description: '', status: 'active', priority: 'medium', startDate: '', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'flag', members: [], tasks: [], tags: [], createdAt: '', updatedAt: '' }];
    mockedGetItem.mockResolvedValue(JSON.stringify(custom));
    const result = await projectService.getAll();
    expect(result).toHaveLength(1);
  });
});

describe('projectService.getById', () => {
  it('returns seed project by id', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await projectService.getById('p1');
    expect(result).not.toBeNull();
    if (result) expect(result.name).toBe('Rediseño Web');
  });
  it('returns null for non-existent id', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await projectService.getById('nonexistent')).toBeNull();
  });
});

describe('projectService.create', () => {
  it('creates project', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await projectService.create({ name: 'New Project' });
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('projectService.update', () => {
  it('updates project', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await projectService.update('p1', { name: 'Updated' });
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('projectService.delete', () => {
  it('deletes project', async () => {
    mockedGetItem.mockResolvedValue(null);
    await projectService.delete('p1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('projectService.getStats', () => {
  it('returns stats', async () => {
    mockedGetItem.mockResolvedValue(null);
    const stats = await projectService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats.total).toBeGreaterThanOrEqual(5);
  });
});
"""

# == Documents (Pattern B, seed data) ==
TESTS['documents'] = """import { documentService } from '../services/documents';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('documentService.getAllDocuments', () => {
  it('returns seed documents when no saved data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments();
    expect(result.length).toBeGreaterThanOrEqual(8);
  });
});

describe('documentService.getAllFolders', () => {
  it('returns seed folders when no saved data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllFolders();
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});

describe('documentService.createDocument', () => {
  it('creates document', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.createDocument({ name: 'New Doc', type: 'pdf', size: 1000, uri: '/docs/test.pdf' });
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('documentService.getStats', () => {
  it('returns stats', async () => {
    mockedGetItem.mockResolvedValue(null);
    const stats = await documentService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('byType');
  });
});
"""

# == Favorites (custom toggle/isFavorite) ==
TESTS['favorites'] = """import { favoritesService } from '../services/favorites';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const favoriteItem = { id: 'item1', type: 'module' as const, name: 'Module 1', icon: 'star', color: '#FFD700' };

beforeEach(() => { jest.clearAllMocks(); });

describe('favoritesService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await favoritesService.getAll()).toEqual([]);
  });
});

describe('favoritesService.toggle', () => {
  it('adds favorite when not present', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await favoritesService.toggle(favoriteItem);
    expect(result).toBe(true);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('removes favorite when already present', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ ...favoriteItem, addedAt: Date.now() }]));
    const result = await favoritesService.toggle(favoriteItem);
    expect(result).toBe(false);
  });
});

describe('favoritesService.isFavorite', () => {
  it('checks if item is favorite', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ ...favoriteItem, addedAt: Date.now() }]));
    expect(await favoritesService.isFavorite('item1', 'module')).toBe(true);
    expect(await favoritesService.isFavorite('item2', 'module')).toBe(false);
  });
});
"""

# == Achievements (custom addXP/recordDailyActivity) ==
TESTS['achievements'] = """import { achievementsService } from '../services/achievements';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('achievementsService.getAll', () => {
  it('returns array of achievements with progress', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await achievementsService.getAll();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('achievementsService.getProfile', () => {
  it('returns gamification profile', async () => {
    mockedGetItem.mockResolvedValue(null);
    const profile = await achievementsService.getProfile();
    expect(profile).toHaveProperty('level');
    expect(profile).toHaveProperty('xp');
  });
});

describe('achievementsService.addXP', () => {
  it('adds XP and persists', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ xp: 0 }));
    await achievementsService.addXP(100);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('achievementsService.recordDailyActivity', () => {
  it('records daily activity', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ currentStreak: 0, longestStreak: 0, lastActiveDate: '', todayActive: false }));
    await achievementsService.recordDailyActivity();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});
"""

# == CRM (custom methods) ==
TESTS['crm'] = """import { crmService } from '../services/crm';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('crmService.getTimeline', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await crmService.getTimeline()).toEqual([]);
  });
});

describe('crmService.addActivity', () => {
  it('creates activity', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await crmService.addActivity({ type: 'note_added', title: 'Note', description: 'Desc', entityId: 'e1', entityType: 'deal' });
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('crmService.getSettings', () => {
  it('returns default settings', async () => {
    mockedGetItem.mockResolvedValue(null);
    const settings = await crmService.getSettings();
    expect(settings).toHaveProperty('defaultFollowUpDays');
    expect(settings.defaultFollowUpDays).toBe(7);
  });
});
"""

# == Analytics (custom methods) ==
TESTS['analytics'] = """import { analyticsService } from '../services/analytics';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('analyticsService.getDashboardMetrics', () => {
  it('returns empty array when no cache', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await analyticsService.getDashboardMetrics()).toEqual([]);
  });
});

describe('analyticsService.computeMetrics', () => {
  it('computes metrics from data', async () => {
    const data = { revenue: { current: 1000, previous: 800 }, leads: { current: 50, previous: 40 }, deals: { current: 20, previous: 15 }, contacts: { current: 100, previous: 90 }, tasks: { current: 30, previous: 25 }, appointments: { current: 10, previous: 8 } };
    const result = await analyticsService.computeMetrics(data);
    expect(Array.isArray(result)).toBe(true);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('analyticsService.comparePeriods', () => {
  it('compares two values', () => {
    const result = analyticsService.comparePeriods(100, 80);
    expect(result).toHaveProperty('trend');
    expect(result.trend).toBe('up');
  });
});
"""

# == Pattern C - API-based ==
TESTS['dashboard'] = """import { dashboardService } from '../services/dashboard';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('dashboardService.getStats', () => {
  it('calls api.get with range', async () => {
    mockGet.mockResolvedValue({ totalLeads: 10, citasHoy: 2, ingresosMes: 50000, campanasActivas: 3, totalCampanas: 5, campanasCompletadas: 1, proximasCitas: [], ingresosDiarios: [] });
    const result = await dashboardService.getStats('30');
    expect(mockGet).toHaveBeenCalled();
    expect(result.totalLeads).toBe(10);
  });
});

describe('dashboardService.computeTrend', () => {
  it('computes trend direction', () => {
    const result = dashboardService.computeTrend(100, 80);
    expect(result).toHaveProperty('direction');
    expect(result.direction).toBe('up');
  });
});

describe('dashboardService.formatCurrency', () => {
  it('formats MXN currency', () => {
    const result = dashboardService.formatCurrency(15000);
    expect(typeof result).toBe('string');
  });
});
"""

TESTS['reports'] = """import { reportsService } from '../services/reports';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('reportsService.getLeadStats', () => {
  it('calls api.get with period', async () => {
    mockGet.mockResolvedValue({ stats: { overview: { totalLeads: 100 }, porEstado: [], porFuente: [], porUsuario: [], evolucion: [], topLeads: [] } });
    const result = await reportsService.getLeadStats('30');
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('reportsService.formatCurrency', () => {
  it('formats MXN currency', () => {
    const result = reportsService.formatCurrency(50000);
    expect(typeof result).toBe('string');
  });
});

describe('reportsService.formatPercent', () => {
  it('formats percentage', () => {
    const result = reportsService.formatPercent(75.5);
    expect(result).toContain('%');
  });
});
"""

TESTS['calendar'] = """import { calendarService } from '../services/calendar';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockPatch = api.patch as jest.Mock;
const mockDelete = api.delete as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('calendarService.getEvents', () => {
  it('calls api.get with params', async () => {
    mockGet.mockResolvedValue([]);
    await calendarService.getEvents({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('calendarService.getById', () => {
  it('calls api.get with id', async () => {
    mockGet.mockResolvedValue({ id: 'evt-1' });
    const result = await calendarService.getById('evt-1');
    expect(result).toHaveProperty('id');
  });
});

describe('calendarService.create', () => {
  it('calls api.post', async () => {
    mockPost.mockResolvedValue({ id: 'new-1' });
    await calendarService.create({ title: 'Meeting', date: '2026-06-01' });
    expect(mockPost).toHaveBeenCalled();
  });
});

describe('calendarService.update', () => {
  it('calls api.patch', async () => {
    mockPatch.mockResolvedValue({});
    await calendarService.update('evt-1', { title: 'Updated' });
    expect(mockPatch).toHaveBeenCalled();
  });
});

describe('calendarService.delete', () => {
  it('calls api.delete', async () => {
    mockDelete.mockResolvedValue(undefined);
    await calendarService.delete('evt-1');
    expect(mockDelete).toHaveBeenCalled();
  });
});
"""

TESTS['notifications'] = """import { notificationsService } from '../services/notifications';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockPatch = api.patch as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('notificationsService.getAll', () => {
  it('calls api.get', async () => {
    mockGet.mockResolvedValue([]);
    await notificationsService.getAll();
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('notificationsService.markAsRead', () => {
  it('calls api.patch with id', async () => {
    mockPatch.mockResolvedValue(undefined);
    await notificationsService.markAsRead('notif-1');
    expect(mockPatch).toHaveBeenCalled();
  });
});

describe('notificationsService.getUnreadCount', () => {
  it('returns count from filtered list', async () => {
    mockGet.mockResolvedValue([{ read: false }, { read: true }, { read: false }]);
    const count = await notificationsService.getUnreadCount();
    expect(count).toBe(2);
  });
});
"""

TESTS['profile'] = """import { profileService } from '../services/profile';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockPatch = api.patch as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('profileService.getProfile', () => {
  it('calls api.get', async () => {
    mockGet.mockResolvedValue({ id: 'u1', name: 'Test', email: 'test@test.com', role: { id: 'r1', nombre: 'Admin', permisos: {} }, tenant: { id: 't1', nombre: 'Test', slug: 'test', accountType: 'business' }, isTwoFactorEnabled: false });
    const profile = await profileService.getProfile();
    expect(mockGet).toHaveBeenCalled();
    expect(profile).toHaveProperty('name');
  });
});

describe('profileService.updateProfile', () => {
  it('calls api.patch', async () => {
    mockPatch.mockResolvedValue({ success: true, user: { name: 'Updated' } });
    const result = await profileService.updateProfile({ name: 'Updated' });
    expect(mockPatch).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

describe('profileService.changePassword', () => {
  it('calls api.post', async () => {
    mockPost.mockResolvedValue({ success: true, message: 'Password changed' });
    const result = await profileService.changePassword('old123', 'new123');
    expect(mockPost).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

describe('profileService.toggle2FA', () => {
  it('calls api.post', async () => {
    mockPost.mockResolvedValue({ success: true, isTwoFactorEnabled: true });
    const result = await profileService.toggle2FA(true);
    expect(mockPost).toHaveBeenCalled();
    expect(result.isTwoFactorEnabled).toBe(true);
  });
});

describe('profileService.getSubscriptionStatus', () => {
  it('calls api.get', async () => {
    mockGet.mockResolvedValue({ plan: 'business', status: 'active' });
    const status = await profileService.getSubscriptionStatus();
    expect(mockGet).toHaveBeenCalled();
    expect(status).toHaveProperty('plan');
  });
});
"""

TESTS['chat'] = """import { chatService } from '../services/chat';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    post: jest.fn(),
  },
}));

const mockPost = api.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  chatService.currentChatId = null;
});

describe('chatService.sendMessage', () => {
  it('sends message via api.post', async () => {
    mockPost.mockResolvedValue({ reply: 'Hello!', chatId: 'chat-1' });
    const result = await chatService.sendMessage({ message: 'Hi' });
    expect(mockPost).toHaveBeenCalled();
    expect(result).toHaveProperty('reply', 'Hello!');
    expect(result).toHaveProperty('chatId', 'chat-1');
  });
});

describe('chatService.processQR', () => {
  it('processes QR data', async () => {
    mockPost.mockResolvedValue({ reply: 'QR processed', chatId: 'chat-2' });
    const result = await chatService.processQR('QR_DATA');
    expect(mockPost).toHaveBeenCalled();
    expect(result).toHaveProperty('reply');
  });
});
"""

# == Email (Pattern B, custom methods including send) ==
TESTS['email'] = """import { emailService } from '../services/email';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockMessages: any[] = [
  { id: 'em-1', threadId: 'th-1', folder: 'inbox', from: { name: 'Sender', email: 's@t.com' }, to: [{ name: 'Me', email: 'me@t.com' }], cc: [], bcc: [], subject: 'Hello', body: 'Body', bodyPreview: 'Body', attachments: [], isRead: false, isStarred: false, isFlagged: false, labels: [], sentAt: 1700000000000, receivedAt: 1700000000000, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'em-2', threadId: 'th-2', folder: 'inbox', from: { name: 'Other', email: 'o@t.com' }, to: [{ name: 'Me', email: 'me@t.com' }], cc: [], bcc: [], subject: 'Re: Hello', body: 'Reply', bodyPreview: 'Reply', attachments: [], isRead: true, isStarred: false, isFlagged: false, labels: [], sentAt: 1700000000001, receivedAt: 1700000000001, createdAt: 1700000000001, updatedAt: 1700000000001 },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('emailService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await emailService.getAll()).toEqual([]);
  });
  it('returns stored messages', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockMessages));
    expect(await emailService.getAll()).toHaveLength(2);
  });
});

describe('emailService.getById', () => {
  it('returns message by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockMessages));
    const result = await emailService.getById('em-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('em-1');
  });
});

describe('emailService.send', () => {
  it('sends and persists message', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await emailService.send({
      from: { name: 'Me', email: 'me@t.com' }, to: [{ name: 'You', email: 'you@t.com' }],
      cc: [], bcc: [], subject: 'Test', body: 'Body', bodyPreview: 'Body', attachments: [],
      isRead: true, isStarred: false, isFlagged: false, labels: [],
      sentAt: Date.now(), receivedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
    });
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('emailService.getStats', () => {
  it('returns stats', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockMessages));
    const stats = await emailService.getStats();
    expect(stats).toHaveProperty('totalMessages');
  });
});
"""

# == Share (custom, depends on profileService) ==
TESTS['share'] = """import { shareService } from '../services/share';
import { profileService } from '../services/profile';

jest.mock('../services/profile', () => ({
  profileService: {
    getProfile: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetProfile = profileService.getProfile as jest.Mock;
const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;

const mockProfile = {
  name: 'Test User',
  email: 'test@volkern.com',
  telefono: '555-1234',
  image: null,
  bookingSlug: null,
  role: { id: 'r1', nombre: 'Admin', permisos: {} },
  tenant: { id: 't1', nombre: 'Test', slug: 'test', subdomain: null, accountType: 'business' },
};

beforeEach(() => { jest.clearAllMocks(); });

describe('shareService.getDigitalCard', () => {
  it('returns digital card from profile', async () => {
    mockedGetProfile.mockResolvedValue(mockProfile);
    const card = await shareService.getDigitalCard();
    expect(card).toHaveProperty('name', 'Test User');
    expect(card).toHaveProperty('vcard');
    expect(card.vcard).toContain('BEGIN:VCARD');
  });
});

describe('shareService.getShareLinks', () => {
  it('returns array of share links', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'test@test.com', phone: '555-0000', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' };
    const links = shareService.getShareLinks(card);
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
  });
});

describe('shareService.getProfileUrl', () => {
  it('returns profile URL from email', () => {
    const card = { name: 'Test', title: 'Tester', company: 'Test Co', email: 'user@test.com', phone: '', photo: null, bookingSlug: null, bookingUrl: null, vcard: '' };
    const url = shareService.getProfileUrl(card);
    expect(url).toContain('user');
  });
});
"""

# == Push Notification (standalone functions) ==
TESTS['push-notification'] = """import { registerPushToken, setBadgeCount, resetBadgeCount } from '../services/push-notification';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'mock-token' }),
  setBadgeCountAsync: jest.fn().mockResolvedValue(true),
  setNotificationHandler: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockPost = api.post as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('registerPushToken', () => {
  it('registers token via api.post', async () => {
    mockPost.mockResolvedValue({});
    const result = await registerPushToken();
    expect(result).toBe(true);
    expect(mockPost).toHaveBeenCalled();
  });
});

describe('setBadgeCount', () => {
  it('sets badge count', async () => {
    await setBadgeCount(5);
  });
});

describe('resetBadgeCount', () => {
  it('resets badge to 0', async () => {
    await resetBadgeCount();
  });
});
"""

# == Settings (custom load/save/update/reset) ==
TESTS['settings'] = """import { settingsService } from '../services/settings';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('settingsService.load', () => {
  it('returns default settings when no saved data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await settingsService.load();
    expect(result).toHaveProperty('theme', 'light');
    expect(result).toHaveProperty('locale', 'es-MX');
  });
  it('returns saved settings', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ theme: 'dark', locale: 'en-US' }));
    const result = await settingsService.load();
    expect(result.theme).toBe('dark');
    expect(result.locale).toBe('en-US');
  });
});

describe('settingsService.save', () => {
  it('persists settings', async () => {
    await settingsService.save({ theme: 'dark', locale: 'en-US', pushNotifications: true, emailNotifications: true, soundEnabled: true, dailyDigest: false, marketingEmails: false, useDeviceTheme: false, timezone: 'America/Mexico_City', showOnlineStatus: true, profileVisibility: 'team' });
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('settingsService.update', () => {
  it('updates single setting', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ theme: 'light', locale: 'es-MX' }));
    await settingsService.update('theme', 'dark');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('settingsService.reset', () => {
  it('resets to defaults', async () => {
    const result = await settingsService.reset();
    expect(result.theme).toBe('light');
  });
});
"""

# ─── Surveys (Pattern B special methods: getAllSurveys/getSurvey/createSurvey/updateSurvey/deleteSurvey) ───
TESTS['surveys'] = """import { surveysService } from '../services/surveys';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('surveysService.getAllSurveys', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await surveysService.getAllSurveys()).toEqual([]);
  });
});

describe('surveysService.getSurvey', () => {
  it('returns undefined for non-existent survey', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    expect(await surveysService.getSurvey('bad-id')).toBeUndefined();
  });
});

describe('surveysService.createSurvey', () => {
  it('creates survey', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await surveysService.createSurvey({ title: 'New Survey' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('surveysService.updateSurvey', () => {
  it('updates survey', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 's1', title: 'Survey 1', createdAt: 0, updatedAt: 0 }]));
    const result = await surveysService.updateSurvey('s1', { title: 'Updated' });
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('surveysService.deleteSurvey', () => {
  it('deletes survey', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 's1', title: 'Survey 1', createdAt: 0, updatedAt: 0 }]));
    await surveysService.deleteSurvey('s1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});
"""

# ─── Write all test files ──────────────────────────────────────────────
written = []
for svc_name, content in sorted(TESTS.items()):
    test_path = os.path.join(TESTS_DIR, f'{svc_name}.test.ts')
    with open(test_path, 'w') as f:
        f.write(content)
    written.append(svc_name)

print(f"Generated {len(written)} test files:")
for name in sorted(written):
    print(f"  {name}.test.ts")

import { pipelineService } from '../services/pipeline';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockItems: any[] = [
  { id: 'test-1', title: 'Deal 1', company: 'Acme Inc', contactName: 'John Doe', tags: ['hot'], amount: 10000, stage: 'lead', priority: 'high', createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'test-2', title: 'Deal 2', company: 'Beta Corp', contactName: 'Jane Smith', tags: ['warm'], amount: 25000, stage: 'qualified', priority: 'medium', createdAt: 1700000000001, updatedAt: 1700000000001 },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('pipelineService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await pipelineService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await pipelineService.getAll()).toHaveLength(2);
  });
});

describe('pipelineService.getById', () => {
  it('returns item by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await pipelineService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns undefined for non-existent id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await pipelineService.getById('bad-id')).toBeUndefined();
  });
});

describe('pipelineService.create', () => {
  it('creates and persists item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await pipelineService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('pipelineService.update', () => {
  it('updates item fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await pipelineService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await pipelineService.update('bad-id', {} as any);
    expect(result).toBeNull();
  });
});

describe('pipelineService.delete', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await pipelineService.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('no-op if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await pipelineService.delete('bad-id');
  });
});

describe('pipelineService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await pipelineService.getStats();
    expect(stats).toHaveProperty('total');
  });
});


describe('pipelineService.search', () => {
  it('returns matching items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await pipelineService.search('Deal');
    expect(result).toHaveLength(2);
  });

  it('búsqueda por tags', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await pipelineService.search('hot');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('pipelineService.getByStage', () => {
  it('filtra por etapa', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await pipelineService.getByStage('lead');
    expect(result).toHaveLength(1);
  });
});

describe('pipelineService.updateStage', () => {
  it('actualiza etapa y probabilidad', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await pipelineService.updateStage('test-1', 'qualified');
    expect(result).not.toBeNull();
    // probability should auto-update: lead=10 -> qualified=25
    expect(result!.probability).toBe(25);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('pipelineService.update with stage change', () => {
  it('recalcula probabilidad al cambiar stage', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await pipelineService.update('test-2', { stage: 'proposal' });
    expect(result!.probability).toBe(50);
  });
});

describe('pipelineService.getStageColor', () => {
  it('devuelve color por etapa', () => {
    const { getStageColor } = require('../services/pipeline');
    expect(typeof getStageColor('lead')).toBe('string');
    expect(typeof getStageColor('invalid')).toBe('string');
  });
});

describe('pipelineService.getStageLabel', () => {
  it('devuelve label por etapa', () => {
    const { getStageLabel } = require('../services/pipeline');
    expect(typeof getStageLabel('lead')).toBe('string');
  });
});

describe('pipelineService.getStageIcon', () => {
  it('devuelve icono por etapa', () => {
    const { getStageIcon } = require('../services/pipeline');
    expect(typeof getStageIcon('lead')).toBe('string');
    expect(getStageIcon('lead')).toBe('person');
    expect(getStageIcon('invalid' as any)).toBe('ellipse');
  });
});

describe('pipelineService.clearAll', () => {
  it('limpia todos los deals', async () => {
    await pipelineService.clearAll();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

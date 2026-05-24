import { surveysService } from '../services/surveys';

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: any[]) => { const p = mockGetItem(...args); return p !== undefined ? p : Promise.resolve(null); },
  setItemAsync: (...args: any[]) => Promise.resolve(mockSetItem(...args)),
}));

beforeEach(() => { jest.clearAllMocks(); });

describe('surveysService.getAllSurveys', () => {
  it('returns empty array when no data', async () => {
    mockGetItem.mockResolvedValue(null);
    expect(await surveysService.getAllSurveys()).toEqual([]);
  });
});

describe('surveysService.getSurvey', () => {
  it('returns undefined for non-existent survey', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([]));
    expect(await surveysService.getSurvey('bad-id')).toBeUndefined();
  });
});

describe('surveysService.createSurvey', () => {
  it('creates survey', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await surveysService.createSurvey({ title: 'New Survey' } as any);
    expect(result.id).toBeDefined();
    expect(mockSetItem).toHaveBeenCalled();
  });
});

describe('surveysService.updateSurvey', () => {
  it('updates survey', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([{ id: 's1', title: 'Survey 1', createdAt: 0, updatedAt: 0 }]));
    const result = await surveysService.updateSurvey('s1', { title: 'Updated' });
    expect(mockSetItem).toHaveBeenCalled();
  });
});

describe('surveysService.deleteSurvey', () => {
  it('deletes survey', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([{ id: 's1', title: 'Survey 1', createdAt: 0, updatedAt: 0 }]));
    await surveysService.deleteSurvey('s1');
    expect(mockSetItem).toHaveBeenCalled();
  });
});


// ─── Extra coverage: filtering and feedback ─────────────────────────────

describe('surveysService.getSurveysByStatus', () => {
  it('filters by status', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([
      { id: 's1', status: 'published', title: 'Pub', questions: [], createdAt: '1', updatedAt: '1', responseCount: 0 },
      { id: 's2', status: 'draft', title: 'Draft', questions: [], createdAt: '2', updatedAt: '2', responseCount: 0 },
    ]));
    const result = await surveysService.getSurveysByStatus('published');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });
});

describe('surveysService.getPublishedSurveys', () => {
  it('returns published surveys', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([
      { id: 's1', status: 'published', title: 'Pub', questions: [], createdAt: '1', updatedAt: '1', responseCount: 0 },
      { id: 's2', status: 'draft', title: 'Draft', questions: [], createdAt: '2', updatedAt: '2', responseCount: 0 },
    ]));
    const result = await surveysService.getPublishedSurveys();
    expect(result).toHaveLength(1);
  });
});

describe('surveysService.submitResponse', () => {
  it('creates a response and updates responseCount', async () => {
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify([])) // responses empty
      .mockResolvedValueOnce(JSON.stringify([{ id: 's1', title: 'S1', status: 'published', responseCount: 0, questions: [], createdAt: '1', updatedAt: '1' }])); // survey exists
    const result = await surveysService.submitResponse('s1', [{ questionId: 'q1', value: 5 }], { source: 'app', anonymous: false });
    expect(result.surveyId).toBe('s1');
    expect(result.answers).toHaveLength(1);
    expect(mockSetItem).toHaveBeenCalled();
  });
});

describe('surveysService.getResponseStats', () => {
  it('returns empty stats for missing survey', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([])); // no surveys
    const stats = await surveysService.getResponseStats('bad-id');
    expect(stats.totalResponses).toBe(0);
  });
});

describe('surveysService.getAllFeedback', () => {
  it('returns empty array when no data', async () => {
    mockGetItem.mockResolvedValue(null);
    expect(await surveysService.getAllFeedback()).toEqual([]);
  });
});

describe('surveysService.submitFeedback', () => {
  it('creates feedback with pending status', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await surveysService.submitFeedback({ type: 'general', message: 'Great!', rating: 5 });
    expect(result.status).toBe('pending');
    expect(result.id).toBeDefined();
    expect(mockSetItem).toHaveBeenCalled();
  });
});

describe('surveysService.updateFeedbackStatus', () => {
  it('updates feedback status', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([{ id: 'f1', type: 'general', message: 'Hi', rating: 5, createdAt: '1', status: 'pending' }]));
    await surveysService.updateFeedbackStatus('f1', 'resolved');
    expect(mockSetItem).toHaveBeenCalled();
  });
});

describe('surveysService.getFeedbackStats', () => {
  it('computes feedback statistics', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify([
      { id: 'f1', type: 'general', message: 'M1', rating: 5, status: 'pending', createdAt: '1' },
      { id: 'f2', type: 'bug', message: 'M2', rating: 3, status: 'resolved', createdAt: '2' },
    ]));
    const stats = await surveysService.getFeedbackStats();
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.resolved).toBe(1);
    expect(stats.averageRating).toBe(4);
  });
});

describe('surveysService.getResponseStats - question breakdown', () => {
  it('computes average and distribution for numeric questions', async () => {
    const survey = {
      id: 's1', title: 'Survey', status: 'published',
      questions: [
        { id: 'q1', type: 'rating', title: 'Rate us', required: true, options: [], order: 0 },
        { id: 'q2', type: 'text', title: 'Comments', required: false, options: [], order: 1 },
      ],
      createdAt: '1', updatedAt: '1', responseCount: 2,
    };
    // getResponseStats calls getResponses first, then getSurvey
    // So first resolved value is for responses, second is for survey
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify([
        { id: 'r1', surveyId: 's1', answers: [{ questionId: 'q1', value: 5 }, { questionId: 'q2', value: 'Good' }], metadata: { source: 'app', anonymous: false }, submittedAt: '1' },
        { id: 'r2', surveyId: 's1', answers: [{ questionId: 'q1', value: 3 }, { questionId: 'q2', value: 'OK' }], metadata: { source: 'app', anonymous: false }, submittedAt: '2' },
      ]))
      .mockResolvedValueOnce(JSON.stringify([survey]));
    const stats = await surveysService.getResponseStats('s1');
    expect(stats.totalResponses).toBe(2);
    expect(stats.questionBreakdown).toHaveLength(2);
    // q1 average = (5+3)/2 = 4
    expect(stats.questionBreakdown![0].average).toBe(4);
  });

  it('handles survey without responses', async () => {
    const survey = { id: 's2', title: 'Empty', status: 'draft', questions: [{ id: 'q1', type: 'rating', title: 'Q', required: true, options: [], order: 0 }], createdAt: '1', updatedAt: '1', responseCount: 0 };
    // First getResponses (empty), then getSurvey (survey exists)
    mockGetItem
      .mockResolvedValueOnce(JSON.stringify([]))
      .mockResolvedValueOnce(JSON.stringify([survey]));
    const stats = await surveysService.getResponseStats('s2');
    expect(stats.totalResponses).toBe(0);
    expect(stats.averageRating).toBeNull();
  });
});


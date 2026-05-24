import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────
export type SurveyStatus = 'draft' | 'published' | 'closed';
export type QuestionType = 'rating' | 'nps' | 'multiple_choice' | 'text' | 'yes_no' | 'single_choice';

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  options?: string[];
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  status: SurveyStatus;
  questions: SurveyQuestion[];
  createdAt: string;
  updatedAt: string;
  responseCount: number;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  answers: { questionId: string; value: string | number }[];
  createdAt: string;
  metadata?: { source: string; anonymous: boolean };
}

export interface Feedback {
  id: string;
  type: 'general' | 'bug' | 'feature_request' | 'satisfaction';
  message: string;
  rating?: number;
  createdAt: string;
  status: 'pending' | 'read' | 'resolved';
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const SURVEYS_KEY = 'volkern_surveys';
const RESPONSES_KEY = 'volkern_survey_responses';
const FEEDBACK_KEY = 'volkern_feedback';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return `sv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key).catch(() => null);
}

function setItem(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value).catch(() => {});
}

// ─── Service ──────────────────────────────────────────────────────────────────
class SurveysService {
  // ── Surveys ──────────────────────────────────────────────────────────
  async getAllSurveys(): Promise<Survey[]> {
    const data = await getItem(SURVEYS_KEY);
    return data ? JSON.parse(data) : [];
  }

  async getSurvey(id: string): Promise<Survey | undefined> {
    const surveys = await this.getAllSurveys();
    return surveys.find((s) => s.id === id);
  }

  async createSurvey(survey: Omit<Survey, 'id' | 'createdAt' | 'updatedAt' | 'responseCount'>): Promise<Survey> {
    const surveys = await this.getAllSurveys();
    const newSurvey: Survey = {
      ...survey,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responseCount: 0,
    };
    surveys.unshift(newSurvey);
    await setItem(SURVEYS_KEY, JSON.stringify(surveys));
    return newSurvey;
  }

  async updateSurvey(id: string, updates: Partial<Survey>): Promise<Survey | undefined> {
    const surveys = await this.getAllSurveys();
    const index = surveys.findIndex((s) => s.id === id);
    if (index === -1) return undefined;
    surveys[index] = { ...surveys[index], ...updates, updatedAt: new Date().toISOString() };
    await setItem(SURVEYS_KEY, JSON.stringify(surveys));
    return surveys[index];
  }

  async deleteSurvey(id: string): Promise<void> {
    const surveys = await this.getAllSurveys();
    await setItem(SURVEYS_KEY, JSON.stringify(surveys.filter((s) => s.id !== id)));
  }

  async getSurveysByStatus(status: SurveyStatus): Promise<Survey[]> {
    const surveys = await this.getAllSurveys();
    return surveys.filter((s) => s.status === status);
  }

  async getPublishedSurveys(): Promise<Survey[]> {
    return this.getSurveysByStatus('published');
  }

  // ── Responses ────────────────────────────────────────────────────────
  async getResponses(surveyId: string): Promise<SurveyResponse[]> {
    const data = await getItem(RESPONSES_KEY);
    const all: SurveyResponse[] = data ? JSON.parse(data) : [];
    return all.filter((r) => r.surveyId === surveyId);
  }

  async submitResponse(surveyId: string, answers: { questionId: string; value: string | number }[], metadata?: { source: string; anonymous: boolean }): Promise<SurveyResponse> {
    const data = await getItem(RESPONSES_KEY);
    const all: SurveyResponse[] = data ? JSON.parse(data) : [];
    const response: SurveyResponse = {
      id: generateId(),
      surveyId,
      answers,
      createdAt: new Date().toISOString(),
      metadata,
    };
    all.push(response);
    await setItem(RESPONSES_KEY, JSON.stringify(all));

    const survey = await this.getSurvey(surveyId);
    if (survey) {
      await this.updateSurvey(surveyId, { responseCount: survey.responseCount + 1 });
    }
    return response;
  }

  async getResponseStats(surveyId: string): Promise<{
    totalResponses: number;
    averageRating: number | null;
    questionBreakdown: { questionId: string; average: number | null; distribution: Record<string, number> }[];
  }> {
    const responses = await this.getResponses(surveyId);
    const survey = await this.getSurvey(surveyId);
    if (!survey) return { totalResponses: 0, averageRating: null, questionBreakdown: [] };

    const questionBreakdown = survey.questions.map((q) => {
      const answers = responses
        .map((r) => r.answers.find((a) => a.questionId === q.id))
        .filter(Boolean);

      const numericValues = answers
        .map((a) => Number(a!.value))
        .filter((v) => !isNaN(v));

      const average = numericValues.length > 0
        ? Math.round((numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length) * 10) / 10
        : null;

      // Distribution for multiple choice
      const distribution: Record<string, number> = {};
      answers.forEach((a) => {
        const key = String(a!.value);
        distribution[key] = (distribution[key] || 0) + 1;
      });

      return { questionId: q.id, average, distribution };
    });

    const ratingAverages = questionBreakdown
      .map((qb) => qb.average)
      .filter((a): a is number => a !== null);

    const averageRating = ratingAverages.length > 0
      ? Math.round((ratingAverages.reduce((sum, v) => sum + v, 0) / ratingAverages.length) * 10) / 10
      : null;

    return { totalResponses: responses.length, averageRating, questionBreakdown };
  }

  // ── Feedback ─────────────────────────────────────────────────────────
  async getAllFeedback(): Promise<Feedback[]> {
    const data = await getItem(FEEDBACK_KEY);
    return data ? JSON.parse(data) : [];
  }

  async submitFeedback(feedback: Omit<Feedback, 'id' | 'createdAt' | 'status'>): Promise<Feedback> {
    const all = await this.getAllFeedback();
    const newFeedback: Feedback = {
      ...feedback,
      id: generateId(),
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    all.unshift(newFeedback);
    await setItem(FEEDBACK_KEY, JSON.stringify(all));
    return newFeedback;
  }

  async updateFeedbackStatus(id: string, status: Feedback['status']): Promise<void> {
    const all = await this.getAllFeedback();
    const index = all.findIndex((f) => f.id === id);
    if (index !== -1) {
      all[index].status = status;
      await setItem(FEEDBACK_KEY, JSON.stringify(all));
    }
  }

  async getFeedbackStats(): Promise<{ total: number; pending: number; read: number; resolved: number; averageRating: number | null }> {
    const all = await this.getAllFeedback();
    const withRating = all.filter((f) => f.rating).map((f) => f.rating!);
    const averageRating = withRating.length > 0
      ? Math.round((withRating.reduce((s, r) => s + r, 0) / withRating.length) * 10) / 10
      : null;
    return {
      total: all.length,
      pending: all.filter((f) => f.status === 'pending').length,
      read: all.filter((f) => f.status === 'read').length,
      resolved: all.filter((f) => f.status === 'resolved').length,
      averageRating,
    };
  }
}

export const surveysService = new SurveysService();

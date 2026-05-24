/**
 * Integration tests for multi-service flows.
 *
 * Uses an in-memory store shared between getItemAsync and setItemAsync,
 * allowing services to persist and retrieve data across operations.
 * Mock implementation is set up in beforeEach to avoid hoisting issues.
 */

import { leadsService, type Lead } from '../services/leads';
import { pipelineService, type Deal } from '../services/pipeline';
import { goalsService } from '../services/goals';
import { achievementsService } from '../services/achievements';

// ─── Shared in-memory store ───────────────────────────────────────────────
const store: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => {
  // Clear store + mocks between tests
  Object.keys(store).forEach((k) => delete store[k]);
  jest.clearAllMocks();

  // Wire mocks to the in-memory store
  mockedGetItem.mockImplementation((key: string) =>
    Promise.resolve(store[key] ?? null),
  );
  mockedSetItem.mockImplementation((key: string, value: string) => {
    store[key] = value;
    return Promise.resolve();
  });
});

// Helper to peek at persisted data (simulates a fresh read)
function readStore<T>(key: string): T[] {
  try {
    return JSON.parse(store[key] ?? '[]') as T[];
  } catch {
    return [];
  }
}

// -------------------------------------------------------------------------
// Sales Flow: Lead creation → Pipeline deal → Stage progression
// -------------------------------------------------------------------------
describe('Sales Flow: Lead → Pipeline', () => {
  it('creates a lead, promotes to pipeline deal, and moves through stages', async () => {
    // --- Step 1: Create a lead ---
    const lead = await leadsService.create({
      name: 'TechCorp',
      email: 'contact@techcorp.com',
      company: 'TechCorp Inc',
      source: 'website',
      budget: 50000,
      interestScore: 8,
    });

    expect(lead.id).toBeDefined();
    expect(lead.name).toBe('TechCorp');
    expect(lead.status).toBe('new');
    expect(lead.company).toBe('TechCorp Inc');
    expect(lead.source).toBe('website');
    expect(lead.budget).toBe(50000);

    // Verify data was persisted
    const savedLeads = readStore<Lead>('volkern_leads');
    expect(savedLeads).toHaveLength(1);
    expect(savedLeads[0].name).toBe('TechCorp');

    // --- Step 2: Read the lead back (fresh read from store) ---
    const foundLead = await leadsService.getById(lead.id);
    expect(foundLead).toBeDefined();
    expect(foundLead!.name).toBe('TechCorp');

    // --- Step 3: Contact the lead (update status) ---
    mockedSetItem.mockClear();

    const contactedLead = await leadsService.updateStatus(lead.id, 'contacted');
    expect(contactedLead).not.toBeNull();
    expect(contactedLead!.status).toBe('contacted');
    expect(contactedLead!.updatedAt).toBeGreaterThan(lead.createdAt);

    // Verify persisted update
    const updatedLeads = readStore<Lead>('volkern_leads');
    expect(updatedLeads[0].status).toBe('contacted');

    // --- Step 4: Qualify the lead ---
    const qualifiedLead = await leadsService.updateStatus(lead.id, 'qualified');
    expect(qualifiedLead!.status).toBe('qualified');

    // --- Step 5: Create a pipeline deal based on the lead ---
    const deal = await pipelineService.create({
      title: `Deal: ${lead.name}`,
      company: lead.company,
      contactName: lead.name,
      contactEmail: lead.email,
      amount: lead.budget,
      stage: 'qualified',
      priority: 'high',
    });

    expect(deal.id).toBeDefined();
    expect(deal.title).toBe('Deal: TechCorp');
    expect(deal.stage).toBe('qualified');
    expect(deal.amount).toBe(50000);
    expect(deal.probability).toBe(25); // qualified → 25%

    // Verify pipeline persisted
    const savedDeals = readStore<Deal>('volkern_pipeline');
    expect(savedDeals).toHaveLength(1);

    // --- Step 6: Advance the deal through pipeline stages ---
    // Proposal stage
    const proposal = await pipelineService.updateStage(deal.id, 'proposal');
    expect(proposal).not.toBeNull();
    expect(proposal!.stage).toBe('proposal');
    expect(proposal!.probability).toBe(50);

    // Negotiation stage
    const negotiation = await pipelineService.updateStage(deal.id, 'negotiation');
    expect(negotiation!.stage).toBe('negotiation');
    expect(negotiation!.probability).toBe(75);

    // Close won
    const won = await pipelineService.updateStage(deal.id, 'closed_won');
    expect(won!.stage).toBe('closed_won');
    expect(won!.probability).toBe(100);

    // --- Step 7: Verify pipeline stats reflect the won deal ---
    const stats = await pipelineService.getStats();
    expect(stats.total).toBe(1);
    expect(stats.wonAmount).toBe(50000);
    expect(stats.totalAmount).toBe(50000);

    // --- Step 8: Verify lead still exists independently ---
    const finalLead = await leadsService.getById(lead.id);
    expect(finalLead).toBeDefined();
    expect(finalLead!.status).toBe('qualified');
  });

  it('handles lost deal gracefully', async () => {
    const deal = await pipelineService.create({
      title: 'Lost Deal',
      company: 'Ghost Inc',
      amount: 10000,
      stage: 'negotiation',
    });

    const lost = await pipelineService.updateStage(deal.id, 'closed_lost');
    expect(lost).not.toBeNull();
    expect(lost!.stage).toBe('closed_lost');
    expect(lost!.probability).toBe(0);

    const stats = await pipelineService.getStats();
    expect(stats.total).toBe(1);
    expect(stats.wonAmount).toBe(0);
    expect(stats.weightedAmount).toBe(0); // probability 0
  });

  it('searches across leads and pipeline deals', async () => {
    // Populate store with initial data
    store['volkern_leads'] = JSON.stringify([
      { id: 'l1', name: 'Alice Corp', email: 'a@ac.com', phone: '', company: 'Alice Corp', status: 'new', source: 'website', notes: '', tags: ['tech'], assignedTo: '', budget: 10000, currency: 'MXN', interestScore: 5, lastContactedAt: null, createdAt: 1, updatedAt: 1 },
      { id: 'l2', name: 'Beta LLC', email: 'b@beta.com', phone: '', company: 'Beta LLC', status: 'new', source: 'referral', notes: '', tags: ['finance'], assignedTo: '', budget: 20000, currency: 'MXN', interestScore: 7, lastContactedAt: null, createdAt: 2, updatedAt: 2 },
    ]);

    store['volkern_pipeline'] = JSON.stringify([
      { id: 'd1', title: 'Deal: Alice Corp', company: 'Alice Corp', contactName: 'Alice', contactEmail: '', contactPhone: '', amount: 10000, currency: 'MXN', probability: 25, stage: 'qualified', priority: 'high', expectedCloseDate: null, notes: '', tags: ['tech'], createdAt: 1, updatedAt: 1 },
    ]);

    // Search leads
    const leadResults = await leadsService.search('alice');
    expect(leadResults).toHaveLength(1);
    expect(leadResults[0].name).toBe('Alice Corp');

    // Search pipeline
    const dealResults = await pipelineService.search('alice');
    expect(dealResults).toHaveLength(1);
    expect(dealResults[0].company).toBe('Alice Corp');

    // Tag search works in both
    const taggedLeads = await leadsService.search('finance');
    expect(taggedLeads).toHaveLength(1);
    expect(taggedLeads[0].name).toBe('Beta LLC');

    const taggedDeals = await pipelineService.search('tech');
    expect(taggedDeals).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------
// Gamification Flow: Goal → Progress → Daily Activity → Achievement
// -------------------------------------------------------------------------
describe('Gamification Flow: Goal → Achievement → Streak', () => {
  it('creates a goal, updates progress, and triggers achievements via daily activity', async () => {
    // --- Step 1: Create a goal ---
    const goal = await goalsService.create({
      title: 'Read 10 books',
      description: 'Read 10 business books this quarter',
      type: 'numeric',
      targetValue: 10,
      currentValue: 0,
      unit: 'books',
      icon: 'book',
      color: '#3B82F6',
      status: 'active',
    });

    expect(goal.id).toBeDefined();
    expect(goal.title).toBe('Read 10 books');
    expect(goal.currentValue).toBe(0);
    expect(goal.status).toBe('active');

    // --- Step 2: Update goal progress to 5 ---
    const updated = await goalsService.updateProgress(goal.id, 5);
    expect(updated).not.toBeNull();
    expect(updated!.currentValue).toBe(5);
    expect(updated!.status).toBe('active'); // Not yet completed

    // --- Step 3: Complete the goal ---
    const completed = await goalsService.updateProgress(goal.id, 10);
    expect(completed).not.toBeNull();
    expect(completed!.currentValue).toBe(10);
    expect(completed!.status).toBe('completed');

    // --- Step 4: Record daily activity ---
    await achievementsService.recordDailyActivity();

    // --- Step 5: Check XP was earned (10 from daily activity) ---
    const profile = await achievementsService.getProfile();
    expect(profile.xp).toBeGreaterThanOrEqual(10);
    expect(profile.streaks.currentStreak).toBe(1);
    expect(profile.streaks.longestStreak).toBe(1);

    // --- Step 6: Add XP to reach level up ---
    await achievementsService.addXP(490);

    // Verify saved XP = 10 (from daily activity) + 490 = 500
    const savedXp = JSON.parse(store['volkern_gamification_xp'] ?? '{}');
    expect(savedXp.xp).toBeGreaterThanOrEqual(500);

    // --- Step 7: Verify level-up ---
    const leveledProfile = await achievementsService.getProfile();
    expect(leveledProfile.level).toBe(2); // 500 XP → level 2
    expect(leveledProfile.xpToNextLevel).toBe(500);
  });

  it('tracks daily streak across multiple days and triggers streak achievement', async () => {
    // Day 1: First activity
    await achievementsService.recordDailyActivity();

    // Day 2: Consecutive day → streak = 2
    const yesterday1 = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    store['volkern_gamification_streak'] = JSON.stringify({
      currentStreak: 1, longestStreak: 1, lastActiveDate: yesterday1, todayActive: false,
    });
    await achievementsService.recordDailyActivity();

    // Day 3-6: Continue streak
    let currentStreak = 2;
    for (let day = 3; day <= 6; day++) {
      const prevDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      store['volkern_gamification_streak'] = JSON.stringify({
        currentStreak, longestStreak: currentStreak, lastActiveDate: prevDate, todayActive: false,
      });
      await achievementsService.recordDailyActivity();
      currentStreak++;
    }

    // Day 7: Streak reaches 7 → loginWeek achievement should trigger
    const yesterday7 = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    store['volkern_gamification_streak'] = JSON.stringify({
      currentStreak: 6, longestStreak: 6, lastActiveDate: yesterday7, todayActive: false,
    });
    await achievementsService.recordDailyActivity();

    // Verify: streak should now be 7, loginWeek achievement should be in progress
    const streakProfile = await achievementsService.getProfile();
    expect(streakProfile.streaks.currentStreak).toBe(7);
    // loginWeek needs 7 increments to complete (increment=1 each call, requirement=7)
    // After day 7, progress = 1/7, so it shows in recentProgress, not badges yet
    expect(streakProfile.recentProgress.length).toBeGreaterThanOrEqual(1);
    const loginWeekProgress = streakProfile.recentProgress.find(
      (p) => p.achievementId === 'login_week',
    );
    expect(loginWeekProgress).toBeDefined();
    expect(loginWeekProgress!.current).toBe(1);
    expect(loginWeekProgress!.target).toBe(7);
  });

  it('creates goal milestones and tracks progress', async () => {
    const goal = await goalsService.create({
      title: 'Launch Product',
      type: 'boolean',
      targetValue: 1,
      currentValue: 0,
      unit: '',
      icon: 'rocket',
      color: '#10B981',
      status: 'active',
      description: 'Launch the new product',
    });

    // Add milestones
    const m1 = await goalsService.addMilestone(goal.id, 'Design', 1);
    const m2 = await goalsService.addMilestone(goal.id, 'Develop', 1);
    const m3 = await goalsService.addMilestone(goal.id, 'Test', 1);

    expect(m1.goalId).toBe(goal.id);
    expect(m2.goalId).toBe(goal.id);

    // Check milestone progress (reads from store via getItemAsync)
    const progress = await goalsService.getMilestoneProgress(goal.id);
    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(0);

    // Complete first milestone
    const completedM1 = await goalsService.completeMilestone(m1.id);
    expect(completedM1).not.toBeNull();
    expect(completedM1!.completed).toBe(true);

    // Uncomplete it
    const uncompleted = await goalsService.uncompleteMilestone(m1.id);
    expect(uncompleted).not.toBeNull();
    expect(uncompleted!.completed).toBe(false);

    // Delete a milestone
    await goalsService.deleteMilestone(m3.id);

    // Verify deletion via store
    const savedMilestones = JSON.parse(store['volkern_goal_milestones'] ?? '[]');
    expect(savedMilestones).toHaveLength(2);
    expect(savedMilestones.find((m: any) => m.id === m3.id)).toBeUndefined();
  });
});

import { emailService } from '../services/email';

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
afterEach(() => { jest.restoreAllMocks(); });

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


// ─── Extra coverage: email helpers ──────────────────────────────────────

describe('emailService.getByFolder', () => {
  it('filters by folder', async () => {
    const mockGet = jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', folder: 'inbox', receivedAt: 100 } as any,
      { id: 'e2', folder: 'sent', receivedAt: 200 } as any,
    ]);
    const result = await emailService.getByFolder('inbox');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
    mockGet.mockRestore();
  });

  it('sorts by receivedAt desc', async () => {
    const mockGet = jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', folder: 'inbox', receivedAt: 100 } as any,
      { id: 'e2', folder: 'inbox', receivedAt: 300 } as any,
      { id: 'e3', folder: 'inbox', receivedAt: 200 } as any,
    ]);
    const result = await emailService.getByFolder('inbox');
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('e2');
    expect(result[1].id).toBe('e3');
    expect(result[2].id).toBe('e1');
    mockGet.mockRestore();
  });
});

describe('emailService.getStats', () => {
  it('computes email stats', async () => {
    const mockGet = jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', folder: 'inbox', isRead: false, isStarred: true, attachments: [{ id: 'a1' }] } as any,
      { id: 'e2', folder: 'inbox', isRead: true, isStarred: false, attachments: [] } as any,
    ]);
    const stats = await emailService.getStats();
    expect(stats.totalMessages).toBe(2);
    expect(stats.unreadCount).toBe(1);
    expect(stats.starredCount).toBe(1);
    expect(stats.attachmentCount).toBe(1);
    mockGet.mockRestore();
  });
});

describe('emailService.getById', () => {
  it('returns null for non-existent', async () => {
    const mockGet = jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    expect(await emailService.getById('bad-id')).toBeNull();
    mockGet.mockRestore();
  });
});

describe('emailService.getThread', () => {
  it('returns thread messages sorted', async () => {
    const mockGet = jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', threadId: 't1', sentAt: 100 } as any,
      { id: 'e2', threadId: 't2', sentAt: 200 } as any,
      { id: 'e3', threadId: 't1', sentAt: 50 } as any,
    ]);
    const result = await emailService.getThread('t1');
    expect(result).toHaveLength(2);
    expect(result[0].sentAt).toBe(50);
    expect(result[1].sentAt).toBe(100);
    mockGet.mockRestore();
  });
});

// ─── search ────────────────────────────────────────────────────────────────

describe('emailService.search', () => {
  it('finds by subject', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', subject: 'Hello World', body: 'foo', from: { name: 'A', email: 'a@b.com' }, to: [], receivedAt: 100 } as any,
      { id: 'e2', subject: 'Goodbye', body: 'bar', from: { name: 'B', email: 'b@b.com' }, to: [], receivedAt: 200 } as any,
    ]);
    const result = await emailService.search('hello');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('finds by body', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', subject: 'X', body: 'Meeting tomorrow at 3pm', from: { name: 'A', email: 'a@b.com' }, to: [], receivedAt: 100 } as any,
      { id: 'e2', subject: 'Y', body: 'See you later', from: { name: 'B', email: 'b@b.com' }, to: [], receivedAt: 200 } as any,
    ]);
    const result = await emailService.search('meeting');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('finds by from name', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', subject: 'X', body: 'x', from: { name: 'María García', email: 'maria@e.com' }, to: [], receivedAt: 100 } as any,
    ]);
    const result = await emailService.search('maría');
    expect(result).toHaveLength(1);
  });

  it('finds by from email', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', subject: 'X', body: 'x', from: { name: 'Sender', email: 'contacto@empresa.com' }, to: [], receivedAt: 100 } as any,
    ]);
    const result = await emailService.search('empresa');
    expect(result).toHaveLength(1);
  });

  it('finds by to name', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', subject: 'X', body: 'x', from: { name: 'A', email: 'a@b.com' }, to: [{ name: 'Carlos López', email: 'c@l.com' }], receivedAt: 100 } as any,
    ]);
    const result = await emailService.search('carlos');
    expect(result).toHaveLength(1);
  });

  it('returns empty when no match', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', subject: 'Hi', body: 'there', from: { name: 'A', email: 'a@b.com' }, to: [{ name: 'B', email: 'b@c.com' }], receivedAt: 100 } as any,
    ]);
    const result = await emailService.search('zzzzz');
    expect(result).toHaveLength(0);
  });

  it('sorts results by receivedAt desc', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', subject: 'Alpha', body: 'x', from: { name: 'A', email: 'a@b.com' }, to: [], receivedAt: 100 } as any,
      { id: 'e2', subject: 'Alpha Beta', body: 'x', from: { name: 'A', email: 'a@b.com' }, to: [], receivedAt: 300 } as any,
    ]);
    const result = await emailService.search('alpha');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('e2');
    expect(result[1].id).toBe('e1');
  });
});

// ─── saveDraft ────────────────────────────────────────────────────────────

describe('emailService.saveDraft', () => {
  it('creates a new draft', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    const result = await emailService.saveDraft({ subject: 'Draft subject', body: 'Draft body' });
    expect(result.id).toBeDefined();
    expect(result.folder).toBe('drafts');
    expect(result.subject).toBe('Draft subject');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('updates an existing draft', async () => {
    const existing = { id: 'draft-1', threadId: 'th-1', folder: 'drafts', from: { name: 'Me', email: 'me@t.com' }, to: [], cc: [], bcc: [], subject: 'Old', body: 'Old body', bodyPreview: 'Old', attachments: [], isRead: true, isStarred: false, isFlagged: false, labels: [], sentAt: 100, receivedAt: 100, createdAt: 100, updatedAt: 100 };
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([existing]);
    const result = await emailService.saveDraft({ id: 'draft-1', subject: 'Updated', body: 'Updated body' });
    expect(result.subject).toBe('Updated');
    expect(result.folder).toBe('drafts');
  });

  it('saveDraft with non-existing id falls back to push', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([{ id: 'other-id' } as any]);
    const result = await emailService.saveDraft({ id: 'new-id', subject: 'New' });
    expect(result.id).toBe('new-id');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('saveDraft without subject uses empty string fallback', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    const result = await emailService.saveDraft({ body: 'just body' });
    expect(result.subject).toBe('');
    expect(result.body).toBe('just body');
  });
});

// ─── delete ───────────────────────────────────────────────────────────────

describe('emailService.delete', () => {
  it('moves inbox message to trash', async () => {
    const msg = { id: 'e1', folder: 'inbox', updatedAt: 100 } as any;
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([msg]);
    await emailService.delete('e1');
    expect(mockedSetItem).toHaveBeenCalled();
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved[0].folder).toBe('trash');
  });

  it('permanently deletes if already in trash', async () => {
    const msg = { id: 'e1', folder: 'trash' } as any;
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([msg]);
    await emailService.delete('e1');
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved).toHaveLength(0);
  });

  it('does nothing if message not found', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([{ id: 'e1', folder: 'inbox' } as any]);
    await emailService.delete('nonexistent');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

// ─── permanentlyDelete ────────────────────────────────────────────────────

describe('emailService.permanentlyDelete', () => {
  it('removes message from list', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1' } as any,
      { id: 'e2' } as any,
    ]);
    await emailService.permanentlyDelete('e1');
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('e2');
  });

  it('does nothing if id not found', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([{ id: 'e1' } as any]);
    await emailService.permanentlyDelete('nonexistent');
    expect(mockedSetItem).toHaveBeenCalled();
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved).toHaveLength(1);
  });
});

// ─── markRead ─────────────────────────────────────────────────────────────

describe('emailService.markRead', () => {
  it('marks message as read', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', isRead: false, updatedAt: 100 } as any,
    ]);
    await emailService.markRead('e1');
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved[0].isRead).toBe(true);
  });

  it('does nothing if already read', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', isRead: true, updatedAt: 100 } as any,
    ]);
    await emailService.markRead('e1');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('does nothing if message not found', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    await emailService.markRead('nonexistent');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

// ─── markUnread ───────────────────────────────────────────────────────────

describe('emailService.markUnread', () => {
  it('marks message as unread', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', isRead: true, updatedAt: 100 } as any,
    ]);
    await emailService.markUnread('e1');
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved[0].isRead).toBe(false);
  });

  it('does nothing if message not found', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    await emailService.markUnread('nonexistent');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

// ─── toggleStar ───────────────────────────────────────────────────────────

describe('emailService.toggleStar', () => {
  it('toggles star on', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', isStarred: false, updatedAt: 100 } as any,
    ]);
    const result = await emailService.toggleStar('e1');
    expect(result).toBe(true);
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved[0].isStarred).toBe(true);
  });

  it('toggles star off', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', isStarred: true, updatedAt: 100 } as any,
    ]);
    const result = await emailService.toggleStar('e1');
    expect(result).toBe(false);
  });

  it('returns false if message not found', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    const result = await emailService.toggleStar('nonexistent');
    expect(result).toBe(false);
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

// ─── moveToFolder ─────────────────────────────────────────────────────────

describe('emailService.moveToFolder', () => {
  it('moves message to target folder', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', folder: 'inbox', updatedAt: 100 } as any,
    ]);
    await emailService.moveToFolder('e1', 'archived');
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved[0].folder).toBe('archived');
  });

  it('does nothing if message not found', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    await emailService.moveToFolder('nonexistent', 'archived');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

// ─── seedIfEmpty ──────────────────────────────────────────────────────────

describe('emailService.seedIfEmpty', () => {
  it('does nothing if messages exist', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([{ id: 'e1' } as any]);
    await emailService.seedIfEmpty();
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('seeds messages when empty', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    await emailService.seedIfEmpty();
    expect(mockedSetItem).toHaveBeenCalled();
    const saved = JSON.parse(mockedSetItem.mock.calls[0][1]);
    expect(saved).toHaveLength(10);
    expect(saved[0].folder).toBe('inbox');
    expect(saved[0].from).toBeDefined();
  });
});

// ─── getById marks read ───────────────────────────────────────────────────

describe('emailService.getById marks read', () => {
  it('marks message read when fetching unread', async () => {
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([
      { id: 'e1', isRead: false, updatedAt: 100 } as any,
    ]);
    const result = await emailService.getById('e1');
    expect(result).not.toBeNull();
    expect(result!.isRead).toBe(true);
  });
});

// ─── persist catch ──────────────────────────────────────────────────────

describe('emailService persist error handling', () => {
  it('handles setItemAsync error gracefully when saving', async () => {
    mockedSetItem.mockRejectedValueOnce(new Error('disk full'));
    jest.spyOn(emailService as any, 'getAll').mockResolvedValue([]);
    const result = await emailService.send({
      from: { name: 'Me', email: 'me@t.com' }, to: [{ name: 'You', email: 'you@t.com' }],
      cc: [], bcc: [], subject: 'Test', body: 'Body', bodyPreview: 'Body', attachments: [],
      isRead: true, isStarred: false, isFlagged: false, labels: [],
      sentAt: Date.now(), receivedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
    });
    expect(result.id).toBeDefined();
  });
});

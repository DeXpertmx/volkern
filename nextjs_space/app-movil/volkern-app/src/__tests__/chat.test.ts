import { chatService } from '../services/chat';
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


// ─── Extra coverage: chat helpers and methods ──────────────────────────

import { responseToMessages } from '../services/chat';

describe('responseToMessages', () => {
  it('converts text response to ChatMessage[]', () => {
    const response = {
      reply: 'Hello!',
      chatId: 'chat-1',
      suggestions: ['Option 1'],
    };
    const messages = responseToMessages(response);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].type).toBe('text');
  });

  it('includes action messages when actions present', () => {
    const response = {
      reply: 'Choose an option:',
      chatId: 'chat-1',
      actions: [{ label: 'Yes', action: 'confirm' }],
    };
    const messages = responseToMessages(response);
    expect(messages).toHaveLength(2);
    expect(messages[1].type).toBe('action');
  });

  it('sets type to card when card present', () => {
    const response = {
      reply: 'Here is the info:',
      chatId: 'chat-1',
      card: { title: 'Info', description: 'Details', type: 'info', data: {} },
    };
    const messages = responseToMessages(response);
    expect(messages[0].type).toBe('card');
  });
});

describe('chatService.sendVoice', () => {
  it('sends voice marker', async () => {
    const { api } = require('../services/api');
    (api.post as jest.Mock).mockResolvedValue({ reply: 'Got it', chatId: 'c1' });
    const result = await chatService.sendVoice('audio.wav');
    expect(result.reply).toBeDefined();
  });
});

describe('chatService.processQR', () => {
  it('sends QR data', async () => {
    const { api } = require('../services/api');
    (api.post as jest.Mock).mockResolvedValue({ reply: 'QR processed', chatId: 'c1' });
    const result = await chatService.processQR('qr-data-123');
    expect(result.reply).toBeDefined();
  });
});

describe('chatService.uploadAttachment', () => {
  it('uploads attachment', async () => {
    const { api } = require('../services/api');
    (api.post as jest.Mock).mockResolvedValue({ reply: 'File received', chatId: 'c1' });
    const result = await chatService.uploadAttachment('file.jpg', 'image');
    expect(result.reply).toBeDefined();
    expect(mockPost).toHaveBeenCalled();
  });
});

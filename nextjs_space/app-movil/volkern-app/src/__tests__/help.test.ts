import {
  getFAQsByCategory,
  searchFAQs,
  getCategoryById,
  FAQ_CATEGORIES,
  FAQ_ITEMS,
  TUTORIALS,
  SUPPORT_CONTACT,
} from '../services/help';

describe('FAQ_CATEGORIES', () => {
  it('has 7 categories', () => {
    expect(FAQ_CATEGORIES).toHaveLength(7);
  });

  it('each category has id, icon, color', () => {
    for (const cat of FAQ_CATEGORIES) {
      expect(cat.id).toBeDefined();
      expect(cat.icon).toBeDefined();
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('SUPPORT_CONTACT', () => {
  it('has email and hours', () => {
    expect(SUPPORT_CONTACT.email).toBe('soporte@volkern.com');
    expect(SUPPORT_CONTACT.hours).toBe('Lun–Vie 9:00–18:00');
    expect(SUPPORT_CONTACT.responseTime).toBe('≤ 24h');
  });
});

describe('FAQ_ITEMS', () => {
  it('has 14 FAQ items', () => {
    expect(FAQ_ITEMS).toHaveLength(14);
  });

  it('each item has required fields', () => {
    for (const faq of FAQ_ITEMS) {
      expect(faq.id).toBeDefined();
      expect(faq.question).toBeDefined();
      expect(faq.answer).toBeDefined();
      expect(faq.category).toBeDefined();
    }
  });
});

describe('TUTORIALS', () => {
  it('has 4 tutorials', () => {
    expect(TUTORIALS).toHaveLength(4);
  });

  it('each tutorial has steps', () => {
    for (const t of TUTORIALS) {
      expect(t.title).toBeDefined();
      expect(t.steps.length).toBeGreaterThan(0);
    }
  });
});

describe('getFAQsByCategory', () => {
  it('returns FAQs for getting-started', () => {
    const result = getFAQsByCategory('getting-started');
    expect(result).toHaveLength(2);
    expect(result[0].question).toContain('empiezo');
  });

  it('returns FAQs for account', () => {
    const result = getFAQsByCategory('account');
    expect(result).toHaveLength(3);
  });

  it('returns empty array for non-existent category', () => {
    const result = getFAQsByCategory('nonexistent');
    expect(result).toHaveLength(0);
  });
});

describe('searchFAQs', () => {
  it('finds by question (case insensitive)', () => {
    const result = searchFAQs('CONTRASEÑA');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].question).toContain('contraseña');
  });

  it('finds by answer content', () => {
    const result = searchFAQs('huella');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns multiple results for broad query', () => {
    const result = searchFAQs('módulos');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array when no match', () => {
    const result = searchFAQs('xyznonexistent123');
    expect(result).toHaveLength(0);
  });

  it('is case insensitive', () => {
    const upper = searchFAQs('GESTION');
    const lower = searchFAQs('gestion');
    expect(upper).toEqual(lower);
  });
});

describe('getCategoryById', () => {
  it('returns category for existing id', () => {
    const cat = getCategoryById('billing');
    expect(cat).toBeDefined();
    expect(cat!.id).toBe('billing');
    expect(cat!.icon).toBe('card');
  });

  it('returns undefined for non-existent id', () => {
    const cat = getCategoryById('nonexistent');
    expect(cat).toBeUndefined();
  });
});

// K-87: vitrin ayarları şemaları.
import { announcementsSchema, DEFAULT_HOME, homeSchema, navigationSchema } from './layout.schemas.js';

describe('homeSchema', () => {
  it('varsayılan düzen geçerli ve En çok satanlar rafını içerir', () => {
    expect(homeSchema.safeParse(DEFAULT_HOME).success).toBe(true);
    expect(DEFAULT_HOME.sections.map((s) => s.type)).toContain('promoPanel');
  });
  it('bilinmeyen tip, eksik grup, boş elle seçim ve tehlikeli bağlantı reddedilir', () => {
    const base = { id: 'a', enabled: true };
    expect(homeSchema.safeParse({ sections: [{ ...base, type: 'x', config: {} }] }).success).toBe(false);
    expect(homeSchema.safeParse({ sections: [{ ...base, type: 'productShelf', config: { source: 'group', limit: 8 } }] }).success).toBe(false);
    expect(homeSchema.safeParse({ sections: [{ ...base, type: 'productShelf', config: { source: 'manual', limit: 8 } }] }).success).toBe(false);
    expect(
      homeSchema.safeParse({ sections: [{ ...base, type: 'campaignStrip', config: { audience: 'all', buttonLink: 'https://x.co' } }] }).success,
    ).toBe(false);
  });
  it('boş metinler alandan düşer', () => {
    const r = homeSchema.parse({ sections: [{ id: 'a', enabled: true, title: '', type: 'campaignStrip', config: { title: ' ', text: null } }] });
    expect(r.sections[0].title).toBeUndefined();
    expect(r.sections[0].config).toEqual({ audience: 'all' });
  });
});

describe('navigationSchema / announcementsSchema', () => {
  it('menü öğesi türüne ait alanlar saklanır', () => {
    const r = navigationSchema.parse({ items: [{ type: 'featured', groupId: null, href: '/x', label: 'Öne' }] });
    expect(r.items[0]).toEqual({ type: 'featured', label: 'Öne' });
  });
  it('duyuru ≤120 karakter, ≤5 öğe', () => {
    expect(announcementsSchema.safeParse({ items: [{ text: 'a'.repeat(121) }] }).success).toBe(false);
    expect(announcementsSchema.safeParse({ items: Array.from({ length: 6 }, () => ({ text: 'x' })) }).success).toBe(false);
    expect(announcementsSchema.safeParse({ items: [{ text: 'x', link: '/katalog' }] }).success).toBe(true);
  });
});

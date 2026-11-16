// K-73: varsayılan site içerikleri.
import { DEFAULT_PAGES, PAGE_SLUGS } from './site-defaults.js';
import { updateSiteSchema } from './site.schemas.js';
import { actionLabel } from '../audit/audit-labels.js';

describe('varsayılan sayfalar', () => {
  it('beş sayfa, HTML yok, SSS 8–10 soru, KVKK/koşullar taslak notlu', () => {
    expect(PAGE_SLUGS).toHaveLength(5);
    for (const slug of PAGE_SLUGS) {
      expect(DEFAULT_PAGES[slug].body).not.toMatch(/<[a-z/][^>]*>/i);
      expect(DEFAULT_PAGES[slug].body.length).toBeLessThanOrEqual(20_000);
    }
    const questions = DEFAULT_PAGES.sss.body.split('\n').filter((l) => l.startsWith('## '));
    expect(questions.length).toBeGreaterThanOrEqual(8);
    expect(questions.length).toBeLessThanOrEqual(10);
    expect(DEFAULT_PAGES.kvkk.body).toContain('TASLAK — hukuk onayı bekliyor');
    expect(DEFAULT_PAGES['kullanim-kosullari'].body).toContain('TASLAK — hukuk onayı bekliyor');
  });
});

describe('updateSiteSchema', () => {
  const contact = { phone: '0552 492 50 58', email: 'a@b.co', address: 'x', city: 'y', workingHours: null, mapUrl: null };
  it('mapUrl https olmalı; bilinmeyen slug reddedilir', () => {
    expect(updateSiteSchema.safeParse({ announcement: null, contact, pages: [] }).success).toBe(true);
    expect(updateSiteSchema.safeParse({ announcement: null, contact: { ...contact, mapUrl: 'http://x.co' }, pages: [] }).success).toBe(false);
    expect(
      updateSiteSchema.safeParse({ announcement: null, contact, pages: [{ slug: 'x', title: 'a', body: 'b', published: true }] }).success,
    ).toBe(false);
  });
});

describe('actionLabel', () => {
  it('bilinen eylem Türkçe, bilinmeyen eylem adının kendisi', () => {
    expect(actionLabel('dealer.approved')).toBe('Bayi başvurusu onaylandı');
    expect(actionLabel('baska.eylem')).toBe('baska.eylem');
  });
});

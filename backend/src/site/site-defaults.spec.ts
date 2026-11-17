// K-73: varsayılan site içerikleri.
import { DEFAULT_PAGES, PAGE_SLUGS } from './site-defaults.js';
import { socialSchema, updateSiteSchema } from './site.schemas.js';
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

describe('onay sürümü (GR-KVK-001)', () => {
  it('sürüm yoksa 1; geçersiz değerler 1', async () => {
    const { pageVersionOf, consentVersionLabel } = await import('./consent-versions.js');
    expect(pageVersionOf({ title: 'x' })).toBe(1);
    expect(pageVersionOf({ version: 3 })).toBe(3);
    expect(pageVersionOf({ version: 0 })).toBe(1);
    expect(pageVersionOf(null)).toBe(1);
    expect(consentVersionLabel(2)).toBe('v2');
  });
});

describe('K-77 sosyal medya şeması', () => {
  const parse = (v: unknown) => socialSchema.safeParse(v);
  it('https ve ilgili alan adı (alt alan adı dahil) kabul; null/boş = kaldır', () => {
    expect(parse({ instagram: 'https://www.instagram.com/x/', tiktok: ' https://tiktok.com/@x ', linkedin: '' })).toMatchObject({
      success: true,
      data: { instagram: 'https://www.instagram.com/x/', tiktok: 'https://tiktok.com/@x', linkedin: null },
    });
    expect(parse({ facebook: null }).success).toBe(true);
    expect(parse({}).success).toBe(true);
  });
  it('http, yanlış/benzer alan adı ve şema reddedilir', () => {
    for (const bad of [
      { instagram: 'http://instagram.com/x' },
      { instagram: 'https://facebook.com/x' },
      { youtube: 'https://evilyoutube.com/x' },
      { youtube: 'https://youtube.com.evil.example/x' },
      { facebook: 'javascript:alert(1)' },
      { linkedin: 'linkedin.com/in/x' },
    ]) {
      expect(parse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

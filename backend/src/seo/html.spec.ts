import { escapeHtml, escapeXml, injectHead, renderHead, safeJsonLd, type PageMeta } from './html.js';

const meta = (over: Partial<PageMeta> = {}): PageMeta => ({
  title: 'T',
  description: 'D',
  canonical: 'https://x.test/a',
  robots: null,
  ogType: 'website',
  ogImage: null,
  siteName: 'S',
  jsonLd: [],
  googleAnalyticsId: null,
  googleSiteVerification: null,
  ...over,
});

describe('SEO HTML kaçışı (K-82)', () => {
  it('escapeHtml tırnak ve etiketleri kaçırır', () => {
    expect(escapeHtml(`"><script>a('&')</script>`)).toBe('&quot;&gt;&lt;script&gt;a(&#39;&amp;&#39;)&lt;/script&gt;');
  });
  it('safeJsonLd </script> ve <!-- dizilerini kırar, JSON olarak aynı kalır', () => {
    const data = { a: `</script><!-- & ${String.fromCharCode(0x2028)}` };
    const out = safeJsonLd(data);
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(JSON.parse(out)).toEqual(data);
  });
  it('escapeXml', () => {
    expect(escapeXml('a&b<c>"\u0001')).toBe('a&amp;b&lt;c&gt;&quot;');
  });
  it('renderHead: GA kimliği biçimsizse yazılmaz', () => {
    expect(renderHead(meta({ googleAnalyticsId: 'G-ABCD1234' }))).toContain('gtag/js?id=G-ABCD1234');
    expect(renderHead(meta({ googleAnalyticsId: "x'><script>" }))).not.toContain('gtag');
  });
  it('injectHead: eski etiketleri siler, $& dizilerini yorumlamaz', () => {
    const html = '<html><head><title>eski</title><meta name="description" content="x"></head><body></body></html>';
    const out = injectHead(html, renderHead(meta({ title: 'A $& B' })));
    expect(out).not.toContain('eski');
    expect(out).toContain('<title>A $&amp; B</title>');
    expect(out.match(/<title>/g)).toHaveLength(1);
  });
});

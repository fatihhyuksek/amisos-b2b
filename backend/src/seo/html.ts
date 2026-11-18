// K-82: sayfaya özel <head> üretimi ve index.html'e enjeksiyon. Tüm dinamik değerler (ürün adı, açıklama, URL ...)
// kullanıcı/Admin girdisidir: HTML özniteliğine/metnine kaçışlanarak, JSON-LD ise `<` `>` `&` kaçışıyla yazılır.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Metin ve çift/tek tırnaklı öznitelik değeri için güvenli kaçış. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]);
}

/** XML (sitemap) için; XML 1.0'da geçersiz denetim karakterleri atılır. */
export function escapeXml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * JSON'u `<script type="application/ld+json">` içine güvenle gömer: `<` (`</script>`, `<!--`), `>`, `&` ve satır
 * ayırıcılar unicode kaçışına çevrilir; JSON olarak anlamı değişmez.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export interface PageMeta {
  /** Tam başlık (şablon uygulanmış). */
  title: string;
  description: string;
  keywords?: string | null;
  /** Mutlak adres; noindex/bilinmeyen sayfalarda null (canonical yazılmaz). */
  canonical: string | null;
  /** `noindex,nofollow` vb.; indexlenebilir sayfada null. */
  robots: string | null;
  ogType: 'website' | 'product';
  ogImage: string | null;
  siteName: string;
  jsonLd: object[];
  googleAnalyticsId: string | null;
  googleSiteVerification: string | null;
}

const GA_ID = /^G-[A-Z0-9]{4,12}$/;

export function renderHead(m: PageMeta): string {
  const e = escapeHtml;
  const tags: string[] = [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}" />`,
  ];
  if (m.keywords) tags.push(`<meta name="keywords" content="${e(m.keywords)}" />`);
  if (m.canonical) tags.push(`<link rel="canonical" href="${e(m.canonical)}" />`);
  if (m.robots) tags.push(`<meta name="robots" content="${e(m.robots)}" />`);
  tags.push(
    `<meta property="og:site_name" content="${e(m.siteName)}" />`,
    `<meta property="og:locale" content="tr_TR" />`,
    `<meta property="og:type" content="${m.ogType === 'product' ? 'product' : 'website'}" />`,
    `<meta property="og:title" content="${e(m.title)}" />`,
    `<meta property="og:description" content="${e(m.description)}" />`,
  );
  if (m.canonical) tags.push(`<meta property="og:url" content="${e(m.canonical)}" />`);
  if (m.ogImage) tags.push(`<meta property="og:image" content="${e(m.ogImage)}" />`);
  tags.push(
    `<meta name="twitter:card" content="${m.ogImage ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${e(m.title)}" />`,
    `<meta name="twitter:description" content="${e(m.description)}" />`,
  );
  if (m.ogImage) tags.push(`<meta name="twitter:image" content="${e(m.ogImage)}" />`);
  if (m.googleSiteVerification) {
    tags.push(`<meta name="google-site-verification" content="${e(m.googleSiteVerification)}" />`);
  }
  if (m.googleAnalyticsId && GA_ID.test(m.googleAnalyticsId)) {
    const id = m.googleAnalyticsId;
    tags.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}"></script>`,
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${safeJsonLd(id)});</script>`,
    );
  }
  for (const ld of m.jsonLd) tags.push(`<script type="application/ld+json">${safeJsonLd(ld)}</script>`);
  return tags.join('\n    ');
}

// index.html'deki varsayılan etiketler sayfaya özel olanlarla değişir (yinelenmesin).
const MANAGED_TAGS = [
  /<title\b[^>]*>[\s\S]*?<\/title>\s*/gi,
  /<meta\s+(?:name|property)\s*=\s*["'](?:description|keywords|robots|google-site-verification|og:[^"']*|twitter:[^"']*)["'][^>]*>\s*/gi,
  /<link\s+rel\s*=\s*["']canonical["'][^>]*>\s*/gi,
];

/** `<head>` içine sayfaya özel etiketleri yerleştirir; `</head>` yoksa belgenin başına ekler. */
export function injectHead(html: string, headTags: string): string {
  let out = html;
  for (const re of MANAGED_TAGS) out = out.replace(re, '');
  const block = `    ${headTags}\n  `;
  // Değiştirici işlev: etiket içindeki `$&` / `$1` gibi diziler özel yorumlanmasın.
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, () => `${block}</head>`);
  return `<head>\n${block}</head>\n${out}`;
}

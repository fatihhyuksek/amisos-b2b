// K-82: sunucu tarafı SEO. Sayfa yolundan (vitrin yolları: `/`, `/katalog`, `/katalog/<grupSlug>`, `/urun/<slug>`,
// bilgi sayfaları) sayfaya özel meta + JSON-LD üretir; sitemap.xml ve robots.txt buradan gelir.
// Yalnızca herkese açık veri kullanılır: FİYAT, STOK, iskonto hiçbir meta/JSON-LD alanına girmez (K-66).
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { loadImages } from '../catalog/product-images.js';
import { SLUG_PATTERN } from '../common/slug.js';
import { DB, type Database } from '../database/database.module.js';
import { productGroups, productSlugRedirects, products } from '../database/schema.js';
import { mediaUrl } from '../media/media.urls.js';
import { PAGE_SLUGS, type PageSlug, type SiteSeo } from '../site/site-defaults.js';
import { SiteService } from '../site/site.service.js';
import { escapeXml, type PageMeta } from './html.js';

export interface PageResult {
  status: number;
  /** Doluysa 301 ile bu yola (mutlak değil, site içi yol) yönlendirilir. */
  redirectTo?: string;
  meta: PageMeta;
}

/** Herkese açık, sabit vitrin sayfaları (ad -> başlık). */
const STATIC_PUBLIC: Record<string, string> = { iletisim: 'İletişim', basvuru: 'Bayi Başvurusu' };
const SITEMAP_MAX_URLS = 50_000;

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Sayfa gövdesi biçiminden (## başlık, - madde) düz özet. */
function plainSummary(body: string, max: number): string {
  return truncate(body.replace(/^#+\s*/gm, '').replace(/^-\s+/gm, ''), max);
}

@Injectable()
export class SeoService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SiteService) private readonly site: SiteService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  private baseUrl(seo: SiteSeo): string {
    return (seo.canonicalBaseUrl ?? this.config.get('APP_URL', { infer: true })).replace(/\/+$/, '');
  }

  async sitemap(): Promise<string> {
    const s = await this.site.loadForSeo();
    const open = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    if (!s.seo.indexable) return `${open}</urlset>\n`;
    const base = this.baseUrl(s.seo);
    const urls: { loc: string; lastmod?: Date | string }[] = [{ loc: `${base}/` }, { loc: `${base}/katalog` }];
    const groups = await this.db
      .select({ slug: productGroups.slug, updatedAt: productGroups.updatedAt })
      .from(productGroups)
      .where(eq(productGroups.isActive, true))
      .orderBy(asc(productGroups.sortOrder), asc(productGroups.slug));
    for (const g of groups) urls.push({ loc: `${base}/katalog/${g.slug}`, lastmod: g.updatedAt });
    const prods = await this.db
      .select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(products.isActive, true), eq(productGroups.isActive, true)))
      .orderBy(asc(products.slug));
    for (const p of prods) urls.push({ loc: `${base}/urun/${p.slug}`, lastmod: p.updatedAt });
    for (const page of s.pages.filter((p) => p.published)) urls.push({ loc: `${base}/${page.slug}`, lastmod: page.updatedAt });
    for (const slug of Object.keys(STATIC_PUBLIC)) urls.push({ loc: `${base}/${slug}` });
    const body = urls
      .slice(0, SITEMAP_MAX_URLS)
      .map((u) => {
        const lastmod = u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : '';
        return `  <url><loc>${escapeXml(u.loc)}</loc>${lastmod}</url>`;
      })
      .join('\n');
    return `${open}${body}\n</urlset>\n`;
  }

  async robots(): Promise<string> {
    const { seo } = await this.site.loadForSeo();
    if (!seo.indexable) return 'User-agent: *\nDisallow: /\n';
    const base = this.baseUrl(seo);
    return [
      'User-agent: *',
      // Ürün görselleri /api/media altından sunulur; /api engellense de görseller taranabilsin (en uzun eşleşme kazanır).
      'Allow: /api/media/',
      'Disallow: /yonetim',
      'Disallow: /sepet',
      'Disallow: /hesabim',
      'Disallow: /siparislerim',
      'Disallow: /api',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ].join('\n');
  }

  /** `pathname` sorgu dizesiz ve çözülmemiş (ham) yoldur. */
  async resolve(pathname: string): Promise<PageResult> {
    const s = await this.site.loadForSeo();
    const base = this.baseUrl(s.seo);
    const siteWide = {
      siteName: s.seo.siteTitle,
      googleAnalyticsId: s.seo.googleAnalyticsId,
      googleSiteVerification: s.seo.googleSiteVerification,
    };
    const withTemplate = (t: string) => s.seo.titleTemplate.replace('%s', () => t);
    const robotsFor = (indexable: boolean) => (indexable && s.seo.indexable ? null : 'noindex,nofollow');
    const ogDefault = s.seo.ogImageMediaId ? `${base}${mediaUrl(s.seo.ogImageMediaId)}` : null;
    const make = (m: Partial<PageMeta> & Pick<PageMeta, 'title' | 'description'>, indexable: boolean): PageMeta => ({
      keywords: s.seo.keywords,
      canonical: null,
      ogType: 'website',
      ogImage: ogDefault,
      jsonLd: [],
      ...siteWide,
      ...m,
      robots: robotsFor(indexable),
    });
    const notFound = (): PageResult => ({
      status: 404,
      meta: make({ title: withTemplate('Sayfa bulunamadı'), description: s.seo.description }, false),
    });

    const segments = pathname.split('/').filter((x) => x.length > 0);
    let decoded: string[];
    try {
      decoded = segments.map((x) => decodeURIComponent(x));
    } catch {
      return notFound();
    }
    const [first, second] = decoded;

    // Ana sayfa
    if (decoded.length === 0) {
      const contact = s.contact;
      const sameAs = Object.values(s.social).filter((v): v is string => !!v);
      return {
        status: 200,
        meta: make(
          {
            title: s.seo.siteTitle,
            description: s.seo.description,
            canonical: `${base}/`,
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'Amisos Züccaciye',
                url: `${base}/`,
                ...(contact.phoneE164 ? { telephone: contact.phoneE164 } : {}),
                ...(contact.email ? { email: contact.email } : {}),
                address: { '@type': 'PostalAddress', streetAddress: contact.address, addressLocality: contact.city, addressCountry: 'TR' },
                ...(sameAs.length > 0 ? { sameAs } : {}),
              },
              {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: s.seo.siteTitle,
                url: `${base}/`,
                potentialAction: {
                  '@type': 'SearchAction',
                  target: { '@type': 'EntryPoint', urlTemplate: `${base}/katalog?q={search_term_string}` },
                  'query-input': 'required name=search_term_string',
                },
              },
            ],
          },
          true,
        ),
      };
    }

    if (first === 'katalog' && decoded.length === 1) {
      return {
        status: 200,
        meta: make({ title: withTemplate('Ürün Kataloğu'), description: s.seo.description, canonical: `${base}/katalog` }, true),
      };
    }

    if (first === 'katalog' && decoded.length === 2) {
      if (!SLUG_PATTERN.test(second)) return notFound();
      const [g] = await this.db
        .select()
        .from(productGroups)
        .where(and(eq(productGroups.slug, second), eq(productGroups.isActive, true)));
      if (!g) return notFound();
      return {
        status: 200,
        meta: make(
          {
            title: withTemplate(g.seoTitle ?? g.name),
            description: truncate(g.seoDescription ?? g.description ?? `${g.name} ürünleri toptan fiyatlarla AMİSOS B2B'de.`, 170),
            canonical: `${base}/katalog/${g.slug}`,
          },
          true,
        ),
      };
    }

    if (first === 'urun' && decoded.length === 2) {
      if (!SLUG_PATTERN.test(second)) return notFound();
      const rows = await this.db
        .select({ product: products, groupActive: productGroups.isActive })
        .from(products)
        .innerJoin(productGroups, eq(productGroups.id, products.groupId))
        .where(eq(products.slug, second));
      const live = rows[0];
      if (!live) {
        const [old] = await this.db
          .select({ slug: products.slug })
          .from(productSlugRedirects)
          .innerJoin(products, eq(products.id, productSlugRedirects.productId))
          .innerJoin(productGroups, eq(productGroups.id, products.groupId))
          .where(and(eq(productSlugRedirects.slug, second), eq(products.isActive, true), eq(productGroups.isActive, true)));
        if (old) return { status: 301, redirectTo: `/urun/${old.slug}`, meta: make({ title: s.seo.siteTitle, description: s.seo.description }, false) };
        return notFound();
      }
      const p = live.product;
      if (!p.isActive || !live.groupActive) return notFound();
      const images = (await loadImages(this.db, [p.id])).get(p.id) ?? [];
      const imageUrls = images.map((i) => `${base}${mediaUrl(i.mediaId)}`);
      const canonical = `${base}/urun/${p.slug}`;
      const description = truncate(p.seoDescription ?? p.description ?? `${p.name} toptan satış, AMİSOS B2B.`, 170);
      return {
        status: 200,
        meta: make(
          {
            title: withTemplate(p.seoTitle ?? p.name),
            description,
            canonical,
            ogType: 'product',
            ogImage: imageUrls[0] ?? ogDefault,
            // K-66: fiyat/stok/iskonto bilgisi JSON-LD'ye ve metalara girmez; `offers` bilerek yok.
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: p.name,
                ...(p.description ? { description: truncate(p.description, 500) } : {}),
                ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
                sku: p.barcode,
                brand: { '@type': 'Brand', name: 'Amisos' },
                url: canonical,
              },
            ],
          },
          true,
        ),
      };
    }

    if (decoded.length === 1 && (PAGE_SLUGS as readonly string[]).includes(first)) {
      const page = s.pages.find((x) => x.slug === (first as PageSlug));
      if (!page || !page.published) return notFound();
      return {
        status: 200,
        meta: make(
          { title: withTemplate(page.title), description: plainSummary(page.body, 160) || s.seo.description, canonical: `${base}/${page.slug}` },
          true,
        ),
      };
    }

    if (decoded.length === 1 && Object.hasOwn(STATIC_PUBLIC, first)) {
      return {
        status: 200,
        meta: make({ title: withTemplate(STATIC_PUBLIC[first]), description: s.seo.description, canonical: `${base}/${first}` }, true),
      };
    }

    // Kişisel/yönetim (yonetim, sepet, hesabim, siparislerim, giris ...) ve bilinmeyen yollar: istemci
    // yönlendirmesi çözer (200); aranmaz.
    return { status: 200, meta: make({ title: s.seo.siteTitle, description: s.seo.description }, false) };
  }
}

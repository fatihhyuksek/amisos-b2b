import { Module } from '@nestjs/common';
import { SiteModule } from '../site/site.module.js';
import { SeoService } from './seo.service.js';

@Module({ imports: [SiteModule], providers: [SeoService], exports: [SeoService] })
export class SeoModule {}

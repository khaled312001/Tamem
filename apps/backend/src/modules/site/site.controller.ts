/**
 * Site config — admin-editable content shown on the public landing page.
 *
 * One Setting row (`site_config`) holds the whole config as JSON, mirroring
 * the HomeConfig pattern. The landing page client-side hydrates from the
 * public GET endpoint on load so an admin save flows live without redeploy.
 *
 * Endpoints:
 *   GET  /site-config           — public read (no auth)
 *   GET  /admin/site-config     — admin read
 *   PUT  /admin/site-config     — admin write
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { ok } from '../../utils/response.js';

const SETTING_KEY = 'site_config';

interface ContactLine {
  key: string;
  phone: string;
  labelAr: string;
  descAr: string;
  whatsappMessage?: string;
}

interface SiteConfig {
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  addressAr: string;
  email: string;
  workingHoursAr: string;
  contacts: ContactLine[];
}

const DEFAULTS: SiteConfig = {
  heroTitle: 'توصيلك في أمان معانا',
  heroSubtitle:
    'منصة توصيل وشحن متكاملة تخدم قفط وقنا والصعيد. دليفري، شحن بين المناطق، وطلبات تجار B2B.',
  heroCtaText: 'حمّل التطبيق الآن',
  addressAr: 'المقر الرئيسي — مدينة قفط، محافظة قنا',
  email: 'info@tamem-delivery.com',
  workingHoursAr: 'يومياً 10 صباحاً — 1 بعد منتصف الليل',
  contacts: [
    {
      key: 'delivery1',
      phone: '+201070750167',
      labelAr: 'خدمة الدليفري — خط 1',
      descAr: 'مطاعم، صيدليات، سوبر ماركت',
      whatsappMessage: 'أهلاً، أريد طلب توصيل',
    },
    {
      key: 'delivery2',
      phone: '+201070750168',
      labelAr: 'خدمة الدليفري — خط 2',
      descAr: 'خط بديل لخدمة التوصيل',
      whatsappMessage: 'أهلاً، أريد طلب توصيل',
    },
    {
      key: 'shipping',
      phone: '+201070750165',
      labelAr: 'خدمة الشحن',
      descAr: 'الشحن بين المحافظات',
      whatsappMessage: 'أهلاً، أريد طلب شحن',
    },
    {
      key: 'support',
      phone: '+201070750169',
      labelAr: 'الشكاوى والإدارة',
      descAr: 'استفسارات وشكاوى للإدارة',
      whatsappMessage: 'أهلاً، عندي شكوى/استفسار للإدارة',
    },
  ],
};

async function readConfig(): Promise<SiteConfig> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return DEFAULTS;
  // The DB stores Prisma JSON — merge into defaults so the response always
  // carries every field even if an older save predated a new field's
  // introduction.
  const stored = (row.value ?? {}) as Partial<SiteConfig>;
  return { ...DEFAULTS, ...stored, contacts: stored.contacts ?? DEFAULTS.contacts };
}

export const getPublic: RequestHandler = async (_req, res, next) => {
  try {
    ok(res, await readConfig());
  } catch (err) {
    next(err);
  }
};

export const getAdmin: RequestHandler = async (_req, res, next) => {
  try {
    ok(res, await readConfig());
  } catch (err) {
    next(err);
  }
};

const contactSchema = z.object({
  key: z.string().min(1).max(40),
  phone: z.string().min(6).max(20),
  labelAr: z.string().min(1).max(120),
  descAr: z.string().min(1).max(200),
  whatsappMessage: z.string().max(500).optional(),
});

const saveSchema = z
  .object({
    heroTitle: z.string().min(1).max(120),
    heroSubtitle: z.string().min(1).max(400),
    heroCtaText: z.string().min(1).max(60),
    addressAr: z.string().min(1).max(200),
    email: z.string().email(),
    workingHoursAr: z.string().min(1).max(120),
    contacts: z.array(contactSchema).min(1).max(10),
  })
  .partial();

export const updateAdmin: RequestHandler = async (req, res, next) => {
  try {
    const input = saveSchema.parse(req.body);
    const current = await readConfig();
    const merged: SiteConfig = {
      ...current,
      ...input,
      contacts: input.contacts ?? current.contacts,
    };
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: merged as unknown as object },
      create: {
        key: SETTING_KEY,
        value: merged as unknown as object,
        description: 'Tamem landing page content (hero + contact)',
      },
    });
    ok(res, merged);
  } catch (err) {
    next(err);
  }
};

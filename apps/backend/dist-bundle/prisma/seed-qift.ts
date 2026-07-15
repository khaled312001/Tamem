/**
 * Seeds real-ish Qift merchants. Idempotent — re-running it skips existing rows.
 *
 *   pnpm --filter @tamem/backend exec tsx prisma/seed-qift.ts
 *
 * Coordinates are clustered around Qift center (26.0297, 32.8146). They aren't
 * surveyed locations — they're representative jitter inside the town footprint
 * so the map looks populated with realistic spread. Replace with surveyed
 * coordinates as you onboard each real shop.
 */
import bcrypt from 'bcryptjs';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Seed = {
  phone: string;
  ownerName: string;
  storeName: string;
  storeNameAr: string;
  categoryId: string;
  addressLine: string;
  lat: number;
  lng: number;
  rating: number;
  isOpen?: boolean;
};

const QIFT_MERCHANTS: Seed[] = [
  // Restaurants
  {
    phone: '+201000010001',
    ownerName: 'محمد الطباخ',
    storeName: 'Bait El Sham',
    storeNameAr: 'بيت الشام',
    categoryId: 'restaurants',
    addressLine: 'شارع المحطة، قفط',
    lat: 26.0301,
    lng: 32.8125,
    rating: 4.6,
  },
  {
    phone: '+201000010002',
    ownerName: 'سيد عبدالله',
    storeName: 'Al Hadara Grill',
    storeNameAr: 'مشاوي الحضارة',
    categoryId: 'restaurants',
    addressLine: 'كورنيش النيل، قفط',
    lat: 26.0325,
    lng: 32.817,
    rating: 4.5,
  },
  {
    phone: '+201000010003',
    ownerName: 'كريم محمود',
    storeName: 'Pizza Qift',
    storeNameAr: 'بيتزا قفط',
    categoryId: 'restaurants',
    addressLine: 'ميدان قفط',
    lat: 26.0291,
    lng: 32.816,
    rating: 4.3,
  },
  {
    phone: '+201000010004',
    ownerName: 'حسن الكشري',
    storeName: "Koshary El Sa'ed",
    storeNameAr: 'كشري الصعيد',
    categoryId: 'restaurants',
    addressLine: 'شارع البحر، قفط',
    lat: 26.0275,
    lng: 32.814,
    rating: 4.7,
    isOpen: false,
  },

  // Supermarkets
  {
    phone: '+201000010010',
    ownerName: 'أحمد مصطفى',
    storeName: 'Qift Market',
    storeNameAr: 'ماركت قفط الكبير',
    categoryId: 'supermarkets',
    addressLine: 'ميدان السكة، قفط',
    lat: 26.0305,
    lng: 32.8155,
    rating: 4.8,
  },
  {
    phone: '+201000010011',
    ownerName: 'سامي العزب',
    storeName: 'Al Azab Supermarket',
    storeNameAr: 'سوبر ماركت العزب',
    categoryId: 'supermarkets',
    addressLine: 'شارع الجمهورية، قفط',
    lat: 26.0288,
    lng: 32.8132,
    rating: 4.6,
  },
  {
    phone: '+201000010012',
    ownerName: 'محمود رضا',
    storeName: 'Al Madina Market',
    storeNameAr: 'سوبر ماركت المدينة',
    categoryId: 'supermarkets',
    addressLine: 'تقسيم الزراعيين، قفط',
    lat: 26.0315,
    lng: 32.8118,
    rating: 4.5,
  },

  // Pharmacies
  {
    phone: '+201000010020',
    ownerName: 'د. عمرو حسين',
    storeName: 'Al Shifa Pharmacy',
    storeNameAr: 'صيدلية الشفاء',
    categoryId: 'pharmacies',
    addressLine: 'شارع المستشفى، قفط',
    lat: 26.0299,
    lng: 32.8108,
    rating: 4.9,
  },
  {
    phone: '+201000010021',
    ownerName: 'د. هند مصطفى',
    storeName: 'Hend Pharmacy',
    storeNameAr: 'صيدلية د/ هند',
    categoryId: 'pharmacies',
    addressLine: 'كورنيش النيل، قفط',
    lat: 26.0332,
    lng: 32.8165,
    rating: 4.8,
  },
  {
    phone: '+201000010022',
    ownerName: 'د. خالد سعيد',
    storeName: 'El Salam Pharmacy',
    storeNameAr: 'صيدلية السلام',
    categoryId: 'pharmacies',
    addressLine: 'ميدان قفط',
    lat: 26.0293,
    lng: 32.8148,
    rating: 4.7,
  },

  // Sweets / bakeries
  {
    phone: '+201000010030',
    ownerName: 'مصطفى السكري',
    storeName: 'El Sokary Sweets',
    storeNameAr: 'حلواني السكري',
    categoryId: 'sweets',
    addressLine: 'شارع المحطة، قفط',
    lat: 26.0302,
    lng: 32.8128,
    rating: 4.9,
  },
  {
    phone: '+201000010031',
    ownerName: 'إيمان البيك',
    storeName: 'Pan Bakery',
    storeNameAr: 'بان بيكري',
    categoryId: 'sweets',
    addressLine: 'شارع الجمهورية، قفط',
    lat: 26.0287,
    lng: 32.8142,
    rating: 4.6,
  },

  // Flowers
  {
    phone: '+201000010040',
    ownerName: 'محمد الورد',
    storeName: 'Tamem Roses',
    storeNameAr: 'ورود تميم',
    categoryId: 'flowers',
    addressLine: 'ميدان قفط',
    lat: 26.0298,
    lng: 32.8152,
    rating: 4.7,
  },

  // Laundry
  {
    phone: '+201000010050',
    ownerName: 'علي المغسلة',
    storeName: 'Clean House',
    storeNameAr: 'مغسلة البيت النظيف',
    categoryId: 'laundry',
    addressLine: 'شارع المحطة، قفط',
    lat: 26.0307,
    lng: 32.8136,
    rating: 4.4,
  },

  // Household
  {
    phone: '+201000010060',
    ownerName: 'محمد البيت',
    storeName: 'Beit El Tamem',
    storeNameAr: 'بيت تميم للمستلزمات',
    categoryId: 'household',
    addressLine: 'شارع الجمهورية، قفط',
    lat: 26.0282,
    lng: 32.8155,
    rating: 4.6,
  },

  // Medical / clinic supplies
  {
    phone: '+201000010070',
    ownerName: 'د. ليلى أحمد',
    storeName: 'Care Medical',
    storeNameAr: 'كير للأدوات الطبية',
    categoryId: 'medical',
    addressLine: 'شارع المستشفى، قفط',
    lat: 26.0303,
    lng: 32.811,
    rating: 4.8,
  },
];

async function main() {
  console.info(`🌱 Seeding ${QIFT_MERCHANTS.length} Qift merchants...`);
  const password = await bcrypt.hash('merchant123', 12);

  let added = 0;
  let skipped = 0;
  for (const m of QIFT_MERCHANTS) {
    const existing = await prisma.user.findUnique({ where: { phone: m.phone } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.user.create({
      data: {
        phone: m.phone,
        name: m.ownerName,
        passwordHash: password,
        role: 'MERCHANT',
        isPhoneVerified: true,
        isActive: true,
        city: 'قفط',
        governorate: 'قنا',
        merchantProfile: {
          create: {
            storeName: m.storeName,
            storeNameAr: m.storeNameAr,
            categoryId: m.categoryId,
            addressLine: m.addressLine,
            lat: m.lat,
            lng: m.lng,
            governorate: 'قنا',
            city: 'قفط',
            rating: m.rating,
            isOpen: m.isOpen ?? true,
          },
        },
      },
    });
    added++;
  }

  console.info(`✅ Added ${added}, skipped ${skipped} (already existed)`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { hash } from 'bcryptjs';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.info('🌱 Seeding Tamem database...');

  // ---- Admin user ----
  const adminPhone = '+201010254819';
  const adminPassword = await hash('admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      phone: adminPhone,
      name: 'Admin',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isPhoneVerified: true,
      isActive: true,
      city: 'قفط',
      governorate: 'قنا',
    },
  });
  console.info(`✅ Admin user: ${admin.phone}`);

  // ---- Categories ----
  // Six base categories: restaurants + supermarkets + pharmacies are the original three;
  // sweets + flowers + laundry are the additional ones requested in Phase 1 Day 1.
  const categories = [
    { key: 'restaurants', name: 'Restaurants', nameAr: 'مطاعم', sortOrder: 1 },
    { key: 'supermarkets', name: 'Supermarkets', nameAr: 'سوبر ماركت', sortOrder: 2 },
    { key: 'pharmacies', name: 'Pharmacies', nameAr: 'صيدليات', sortOrder: 3 },
    { key: 'sweets', name: 'Sweets', nameAr: 'حلويات', sortOrder: 4 },
    { key: 'flowers', name: 'Flowers & Gifts', nameAr: 'ورد وهدايا', sortOrder: 5 },
    { key: 'laundry', name: 'Laundry', nameAr: 'مغسلة', sortOrder: 6 },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.key },
      update: { name: c.name, nameAr: c.nameAr, sortOrder: c.sortOrder },
      create: { id: c.key, name: c.name, nameAr: c.nameAr, sortOrder: c.sortOrder, isActive: true },
    });
  }
  console.info(`✅ ${categories.length} categories`);

  // ---- Sample services ----
  const deliveryService = await prisma.service.upsert({
    where: { key: 'delivery-supermarket' },
    update: {},
    create: {
      key: 'delivery-supermarket',
      name: 'Supermarket Delivery',
      nameAr: 'دليفري سوبر ماركت',
      category: 'DELIVERY',
      pricingMethod: 'FIXED',
      basePrice: 25,
      requiresPickupLocation: false,
      requiresDeliveryLocation: true,
      requiresImageUpload: false,
      allowsTextNote: true,
      supportsMultiplePickups: false,
      supportsMultipleDeliveries: false,
      sortOrder: 1,
      createdById: admin.id,
      fields: {
        create: [
          {
            key: 'order_text',
            label: 'Order details',
            labelAr: 'تفاصيل الطلب',
            type: 'TEXTAREA',
            isRequired: true,
            sortOrder: 1,
            placeholderAr: 'مثال: 2 كيلو سكر، زيت، 3 علب تونة',
          },
          {
            key: 'attachment',
            label: 'Attach image (optional)',
            labelAr: 'أرفق صورة (اختياري)',
            type: 'IMAGE',
            isRequired: false,
            sortOrder: 2,
            validation: { maxImages: 3 },
          },
        ],
      },
    },
  });

  const shippingService = await prisma.service.upsert({
    where: { key: 'shipping-parcel' },
    update: {},
    create: {
      key: 'shipping-parcel',
      name: 'Parcel Shipping',
      nameAr: 'شحن طرود',
      category: 'SHIPPING',
      pricingMethod: 'DISTANCE_WEIGHT',
      basePrice: 30,
      pricePerKm: 2,
      pricePerKg: 5,
      requiresPickupLocation: true,
      requiresDeliveryLocation: true,
      requiresImageUpload: false,
      allowsTextNote: true,
      sortOrder: 2,
      createdById: admin.id,
    },
  });

  const merchantService = await prisma.service.upsert({
    where: { key: 'merchant-bulk' },
    update: {},
    create: {
      key: 'merchant-bulk',
      name: 'Merchant Bulk Order',
      nameAr: 'طلب تاجر / موزع',
      category: 'MERCHANT',
      pricingMethod: 'QUOTE',
      requiresPickupLocation: true,
      requiresDeliveryLocation: true,
      allowsTextNote: true,
      supportsMultiplePickups: true,
      supportsMultipleDeliveries: true,
      sortOrder: 3,
      createdById: admin.id,
    },
  });

  // Additional services requested for Phase 1 Day 1:
  // - Laundry pickup (delivery, fixed pricing, with item-count selection)
  // - Flower / gift delivery (delivery, fixed pricing, with occasion + recipient phone)
  const laundryService = await prisma.service.upsert({
    where: { key: 'delivery-laundry' },
    update: {},
    create: {
      key: 'delivery-laundry',
      name: 'Laundry Pickup',
      nameAr: 'استلام مغسلة',
      category: 'DELIVERY',
      pricingMethod: 'FIXED',
      basePrice: 20,
      requiresPickupLocation: true,
      requiresDeliveryLocation: true,
      requiresImageUpload: false,
      allowsTextNote: true,
      supportsMultiplePickups: false,
      supportsMultipleDeliveries: false,
      sortOrder: 4,
      createdById: admin.id,
      fields: {
        create: [
          {
            key: 'service_type',
            label: 'Service type',
            labelAr: 'نوع الخدمة',
            type: 'SELECT',
            isRequired: true,
            sortOrder: 1,
            options: [
              { value: 'wash', label: 'غسيل فقط' },
              { value: 'wash_iron', label: 'غسيل وكي' },
              { value: 'iron_only', label: 'كي فقط' },
              { value: 'dry_clean', label: 'تنظيف جاف' },
            ],
          },
          {
            key: 'item_count',
            label: 'Number of items',
            labelAr: 'عدد القطع التقريبي',
            type: 'NUMBER',
            isRequired: true,
            sortOrder: 2,
            validation: { min: 1, max: 100 },
          },
          {
            key: 'pickup_time',
            label: 'Preferred pickup time',
            labelAr: 'وقت الاستلام المفضّل',
            type: 'TIME',
            isRequired: false,
            sortOrder: 3,
          },
          {
            key: 'notes',
            label: 'Notes',
            labelAr: 'ملاحظات',
            type: 'TEXTAREA',
            isRequired: false,
            sortOrder: 4,
            placeholderAr: 'أي تعليمات خاصة (بقع، نوع قماش حساس...)',
          },
        ],
      },
    },
  });

  const flowersService = await prisma.service.upsert({
    where: { key: 'delivery-flowers' },
    update: {},
    create: {
      key: 'delivery-flowers',
      name: 'Flowers & Gifts Delivery',
      nameAr: 'توصيل ورد وهدايا',
      category: 'DELIVERY',
      pricingMethod: 'FIXED',
      basePrice: 35,
      requiresPickupLocation: false,
      requiresDeliveryLocation: true,
      requiresImageUpload: true,
      allowsTextNote: true,
      supportsMultiplePickups: false,
      supportsMultipleDeliveries: false,
      sortOrder: 5,
      createdById: admin.id,
      fields: {
        create: [
          {
            key: 'occasion',
            label: 'Occasion',
            labelAr: 'المناسبة',
            type: 'SELECT',
            isRequired: true,
            sortOrder: 1,
            options: [
              { value: 'birthday', label: 'عيد ميلاد' },
              { value: 'wedding', label: 'فرح / خطوبة' },
              { value: 'anniversary', label: 'ذكرى زواج' },
              { value: 'sympathy', label: 'تعزية' },
              { value: 'graduation', label: 'تخرّج' },
              { value: 'other', label: 'أخرى' },
            ],
          },
          {
            key: 'recipient_name',
            label: 'Recipient name',
            labelAr: 'اسم المستلم',
            type: 'TEXT',
            isRequired: true,
            sortOrder: 2,
          },
          {
            key: 'recipient_phone',
            label: 'Recipient phone',
            labelAr: 'رقم المستلم',
            type: 'PHONE',
            isRequired: true,
            sortOrder: 3,
          },
          {
            key: 'card_message',
            label: 'Card message',
            labelAr: 'كلمة على البطاقة',
            type: 'TEXTAREA',
            isRequired: false,
            sortOrder: 4,
            placeholderAr: 'مثال: كل سنة وأنت طيب 🌹',
          },
          {
            key: 'reference_image',
            label: 'Reference image',
            labelAr: 'صورة مرجعية للورد/الهدية',
            type: 'IMAGE',
            isRequired: false,
            sortOrder: 5,
            validation: { maxImages: 2 },
          },
        ],
      },
    },
  });

  console.info(
    `✅ Services: ${deliveryService.nameAr}, ${shippingService.nameAr}, ${merchantService.nameAr}, ${laundryService.nameAr}, ${flowersService.nameAr}`,
  );

  // ---- Default settings ----
  const settings = [
    { key: 'driver_cash_limit', value: 1000, description: 'حد الكاش الأقصى للسائق (EGP)' },
    { key: 'order_pending_alert_minutes', value: 60, description: 'دقائق قبل تنبيه طلب معلق' },
    { key: 'driver_idle_alert_minutes', value: 25, description: 'دقائق قبل تنبيه سائق لا يرد' },
    {
      key: 'whatsapp_business_number',
      value: '+201010254819',
      description: 'رقم WhatsApp الرسمي لتميم',
    },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: { key: s.key, value: s.value, description: s.description },
    });
  }
  console.info(`✅ ${settings.length} default settings`);

  console.info('\n🎉 Seed complete!');
  console.info(`   Login as admin: phone=${adminPhone} password=admin123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

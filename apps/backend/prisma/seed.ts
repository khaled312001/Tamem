import bcrypt from 'bcryptjs';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.info('🌱 Seeding Tamem database...');

  // ============================================
  // Admin user
  // ============================================
  const adminPhone = '+201010254819';
  const adminPassword = await bcrypt.hash('admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      phone: adminPhone,
      name: 'مدير تميم',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isPhoneVerified: true,
      isActive: true,
      city: 'قفط',
      governorate: 'قنا',
    },
  });
  console.info(`✅ Admin: ${admin.phone} (password: admin123!)`);

  // ============================================
  // Categories — store categories (restaurants, pharmacies, ...)
  // ============================================
  const categories = [
    { id: 'restaurants', name: 'Restaurants', nameAr: 'مطاعم', sortOrder: 1 },
    { id: 'supermarkets', name: 'Supermarkets', nameAr: 'سوبر ماركت', sortOrder: 2 },
    { id: 'pharmacies', name: 'Pharmacies', nameAr: 'صيدليات', sortOrder: 3 },
    { id: 'sweets', name: 'Sweets', nameAr: 'حلويات', sortOrder: 4 },
    { id: 'flowers', name: 'Flowers & Gifts', nameAr: 'ورد وهدايا', sortOrder: 5 },
    { id: 'laundry', name: 'Laundry', nameAr: 'مغسلة', sortOrder: 6 },
    { id: 'household', name: 'Household supplies', nameAr: 'مستلزمات منزلية', sortOrder: 7 },
    { id: 'medical', name: 'Medical & Health', nameAr: 'طبي وصحي', sortOrder: 8 },
    { id: 'documents', name: 'Document delivery', nameAr: 'توصيل مستندات', sortOrder: 9 },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      update: { name: c.name, nameAr: c.nameAr, sortOrder: c.sortOrder },
      create: { ...c, isActive: true },
    });
  }
  console.info(`✅ ${categories.length} categories`);

  // ============================================
  // Services — the dynamic services that drive the customer app
  // ============================================
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

  const pharmacyService = await prisma.service.upsert({
    where: { key: 'delivery-pharmacy' },
    update: {},
    create: {
      key: 'delivery-pharmacy',
      name: 'Pharmacy Delivery',
      nameAr: 'صيدلية',
      category: 'DELIVERY',
      pricingMethod: 'FIXED',
      basePrice: 20,
      requiresDeliveryLocation: true,
      allowsTextNote: true,
      sortOrder: 2,
      createdById: admin.id,
      fields: {
        create: [
          {
            key: 'prescription_image',
            label: 'Prescription photo',
            labelAr: 'صورة الروشتة',
            type: 'IMAGE',
            isRequired: true,
            sortOrder: 1,
            validation: { maxImages: 5 },
            helpTextAr: 'صور واضحة للروشتة من 4 جوانب لو طويلة',
          },
          {
            key: 'order_notes',
            label: 'Notes',
            labelAr: 'ملاحظات (اختياري)',
            type: 'TEXTAREA',
            isRequired: false,
            sortOrder: 2,
          },
        ],
      },
    },
  });

  const restaurantService = await prisma.service.upsert({
    where: { key: 'delivery-restaurant' },
    update: {},
    create: {
      key: 'delivery-restaurant',
      name: 'Restaurant Order',
      nameAr: 'طلب مطعم',
      category: 'DELIVERY',
      pricingMethod: 'FIXED',
      basePrice: 30,
      requiresDeliveryLocation: true,
      allowsTextNote: true,
      sortOrder: 3,
      createdById: admin.id,
      fields: {
        create: [
          {
            key: 'order_text',
            label: 'Your order',
            labelAr: 'طلبك',
            type: 'TEXTAREA',
            isRequired: true,
            sortOrder: 1,
            placeholderAr: 'مثال: 2 بيتزا وسط، عصير برتقال',
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
      allowsTextNote: true,
      sortOrder: 4,
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
      sortOrder: 5,
      createdById: admin.id,
    },
  });

  console.info(
    `✅ 5 Services: ${deliveryService.nameAr}, ${pharmacyService.nameAr}, ${restaurantService.nameAr}, ${shippingService.nameAr}, ${merchantService.nameAr}`,
  );

  // ============================================
  // Default settings
  // ============================================
  const settings = [
    { key: 'driver_cash_limit', value: 1000, description: 'حد الكاش الأقصى للسائق (EGP)' },
    {
      key: 'order_pending_alert_minutes',
      value: 60,
      description: 'دقائق قبل تنبيه طلب معلق',
    },
    {
      key: 'driver_idle_alert_minutes',
      value: 25,
      description: 'دقائق قبل تنبيه سائق لا يرد',
    },
    {
      key: 'whatsapp_business_number',
      value: '+201010254819',
      description: 'رقم WhatsApp الرسمي لتميم',
    },
    {
      key: 'service_areas',
      value: ['قفط', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر'],
      description: 'المناطق المدعومة للخدمة',
    },
    {
      key: 'cancellation_window_minutes',
      value: 5,
      description: 'دقائق يمكن للعميل إلغاء الطلب بعدها (قبل تعيين سائق)',
    },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: s,
    });
  }
  console.info(`✅ ${settings.length} settings`);

  // ============================================
  // Mock customer + driver for development
  // ============================================
  const customerPwd = await bcrypt.hash('customer123', 12);
  const driverPwd = await bcrypt.hash('driver123', 12);

  const mockCustomer = await prisma.user.upsert({
    where: { phone: '+201000000001' },
    update: {},
    create: {
      phone: '+201000000001',
      name: 'محمد علي',
      passwordHash: customerPwd,
      role: 'CUSTOMER',
      isPhoneVerified: true,
      isActive: true,
      city: 'قفط',
      governorate: 'قنا',
      defaultAddress: 'شارع الجمهورية، قفط',
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { phone: '+201000000002' },
    update: {},
    create: {
      phone: '+201000000002',
      name: 'محمود حسن',
      passwordHash: driverPwd,
      role: 'DRIVER',
      isPhoneVerified: true,
      isActive: true,
      city: 'قفط',
      governorate: 'قنا',
    },
  });
  await prisma.driverProfile.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: {
      userId: driverUser.id,
      status: 'AVAILABLE',
      vehicleType: 'دراجة بخارية',
      vehiclePlate: 'ق ن 3012',
      governorate: 'قنا',
      rating: 4.9,
    },
  });
  console.info(
    `✅ Mock customer (+201000000001 / customer123) + driver (+201000000002 / driver123)`,
  );

  // ============================================
  // Mock merchants (for dashboard + mobile map testing)
  // ============================================
  const merchantPwd = await bcrypt.hash('merchant123', 12);
  const mockMerchants = [
    {
      phone: '+201000000010',
      name: 'مدير اسكندراني',
      storeName: 'Iskandarani Restaurant',
      storeNameAr: 'مطعم اسكندراني',
      categoryId: 'restaurants',
      addressLine: 'شارع الجمهورية، قفط',
      lat: 26.0297,
      lng: 32.8146,
      rating: 4.7,
    },
    {
      phone: '+201000000011',
      name: 'مدير السبعي',
      storeName: 'El Sabaie Market',
      storeNameAr: 'ماركت السبعي',
      categoryId: 'supermarkets',
      addressLine: 'ميدان قفط',
      lat: 26.031,
      lng: 32.815,
      rating: 4.8,
    },
    {
      phone: '+201000000012',
      name: 'د. حسين كمال',
      storeName: 'Hussein Kamal Pharmacy',
      storeNameAr: 'صيدلية د/ حسين كمال محمد',
      categoryId: 'pharmacies',
      addressLine: 'شارع المحطة، قفط',
      lat: 26.028,
      lng: 32.813,
      rating: 4.9,
    },
  ];
  for (const m of mockMerchants) {
    const existing = await prisma.user.findUnique({ where: { phone: m.phone } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        phone: m.phone,
        name: m.name,
        passwordHash: merchantPwd,
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
            isOpen: true,
          },
        },
      },
    });
  }
  console.info(`✅ ${mockMerchants.length} mock merchants seeded`);

  // ============================================
  // Mock offer (banner)
  // ============================================
  const existingOffer = await prisma.offer.findFirst({
    where: { title: 'First Order 20% Off' },
  });
  if (!existingOffer) {
    await prisma.offer.create({
      data: {
        title: 'First Order 20% Off',
        titleAr: 'خصم 20% على أول طلب',
        imageUrl: 'https://placehold.co/600x300/E0301E/FFFFFF.png?text=TAMEM20',
        linkType: 'NONE',
        sortOrder: 1,
        isActive: true,
      },
    });
    console.info(`✅ 1 default offer seeded`);
  }

  // ============================================
  // Mock orders — for dashboard testing before mobile is wired up
  // ============================================
  const existingMockOrder = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: 'TMM-MOCK-' } },
  });
  if (!existingMockOrder) {
    const mockOrders = [
      {
        orderNumber: 'TMM-MOCK-00001',
        serviceId: deliveryService.id,
        category: 'DELIVERY' as const,
        status: 'NEW' as const,
        notes: '2 كيلو سكر، زيت، 3 علب تونة',
        deliveryAddress: 'شارع الجمهورية، قفط',
        deliveryLat: 26.0297,
        deliveryLng: 32.8146,
        paymentMethod: 'CASH' as const,
      },
      {
        orderNumber: 'TMM-MOCK-00002',
        serviceId: pharmacyService.id,
        category: 'DELIVERY' as const,
        status: 'UNDER_REVIEW' as const,
        deliveryAddress: 'شارع المحطة، قفط',
        deliveryLat: 26.03,
        deliveryLng: 32.815,
        paymentMethod: 'VODAFONE_CASH' as const,
      },
      {
        orderNumber: 'TMM-MOCK-00003',
        serviceId: shippingService.id,
        category: 'SHIPPING' as const,
        status: 'PRICED' as const,
        quotedPrice: 85,
        pickupAddress: 'قفط',
        pickupLat: 26.0297,
        pickupLng: 32.8146,
        deliveryAddress: 'الأقصر',
        deliveryLat: 25.6872,
        deliveryLng: 32.6396,
        weightKg: 5,
        sizeCategory: 'MEDIUM' as const,
        speedTier: 'STANDARD' as const,
        paymentMethod: 'CASH' as const,
      },
      {
        orderNumber: 'TMM-MOCK-00004',
        serviceId: restaurantService.id,
        category: 'DELIVERY' as const,
        status: 'IN_ROUTE' as const,
        notes: '2 بيتزا وسط، عصير برتقال',
        quotedPrice: 45,
        finalPrice: 45,
        assignedDriverId: driverUser.id,
        deliveryAddress: 'شارع الجمهورية، قفط',
        deliveryLat: 26.0297,
        deliveryLng: 32.8146,
        paymentMethod: 'CASH' as const,
        paymentStatus: 'PENDING' as const,
      },
      {
        orderNumber: 'TMM-MOCK-00005',
        serviceId: deliveryService.id,
        category: 'DELIVERY' as const,
        status: 'COMPLETED' as const,
        notes: 'شامبو، صابون، معجون أسنان',
        quotedPrice: 60,
        finalPrice: 60,
        assignedDriverId: driverUser.id,
        deliveryAddress: 'شارع الجامعة، قفط',
        deliveryLat: 26.031,
        deliveryLng: 32.816,
        paymentMethod: 'CASH' as const,
        paymentStatus: 'PAID' as const,
        completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ];

    for (const o of mockOrders) {
      const created = await prisma.order.create({
        data: {
          ...o,
          customerId: mockCustomer.id,
        },
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId: created.id,
          toStatus: 'NEW',
          changedById: mockCustomer.id,
          changedByRole: 'CUSTOMER',
        },
      });
    }
    console.info(`✅ ${mockOrders.length} mock orders for dashboard testing`);
  } else {
    console.info(`ℹ️  Mock orders already exist - skipped`);
  }

  console.info('\n🎉 Seed complete!\n');
  console.info('Login credentials:');
  console.info(`  Admin    : ${adminPhone}      / admin123!`);
  console.info(`  Customer : +201000000001      / customer123`);
  console.info(`  Driver   : +201000000002      / driver123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

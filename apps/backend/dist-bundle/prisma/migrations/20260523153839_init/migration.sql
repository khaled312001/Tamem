-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `role` ENUM('CUSTOMER', 'DRIVER', 'MERCHANT', 'ADMIN') NOT NULL DEFAULT 'CUSTOMER',
    `googleId` VARCHAR(191) NULL,
    `isPhoneVerified` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `city` VARCHAR(191) NULL,
    `governorate` VARCHAR(191) NULL,
    `defaultAddress` VARCHAR(500) NULL,
    `fcmToken` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_phone_key`(`phone`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_googleId_key`(`googleId`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DriverProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('AVAILABLE', 'BUSY', 'OFFLINE') NOT NULL DEFAULT 'OFFLINE',
    `vehicleType` VARCHAR(191) NOT NULL,
    `vehiclePlate` VARCHAR(191) NOT NULL,
    `nationalId` VARCHAR(191) NULL,
    `licenseImageUrl` VARCHAR(191) NULL,
    `currentLat` DECIMAL(10, 7) NULL,
    `currentLng` DECIMAL(10, 7) NULL,
    `lastLocationAt` DATETIME(3) NULL,
    `totalDeliveries` INTEGER NOT NULL DEFAULT 0,
    `totalEarnings` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `cashOnHand` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `rating` DECIMAL(3, 2) NULL,
    `governorate` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DriverProfile_userId_key`(`userId`),
    INDEX `DriverProfile_status_idx`(`status`),
    INDEX `DriverProfile_governorate_idx`(`governorate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MerchantProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `storeName` VARCHAR(191) NOT NULL,
    `storeNameAr` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `coverUrl` VARCHAR(191) NULL,
    `addressLine` VARCHAR(500) NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `governorate` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `openHours` JSON NULL,
    `isOpen` BOOLEAN NOT NULL DEFAULT true,
    `rating` DECIMAL(3, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MerchantProfile_userId_key`(`userId`),
    INDEX `MerchantProfile_categoryId_idx`(`categoryId`),
    INDEX `MerchantProfile_governorate_idx`(`governorate`),
    INDEX `MerchantProfile_isOpen_idx`(`isOpen`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NOT NULL,
    `iconUrl` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Service` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NOT NULL,
    `category` ENUM('DELIVERY', 'SHIPPING', 'MERCHANT') NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `iconUrl` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `pricingMethod` ENUM('FIXED', 'DISTANCE', 'WEIGHT', 'DISTANCE_WEIGHT', 'QUOTE') NOT NULL,
    `basePrice` DECIMAL(10, 2) NULL,
    `pricePerKm` DECIMAL(10, 2) NULL,
    `pricePerKg` DECIMAL(10, 2) NULL,
    `requiresPickupLocation` BOOLEAN NOT NULL DEFAULT false,
    `requiresDeliveryLocation` BOOLEAN NOT NULL DEFAULT true,
    `requiresImageUpload` BOOLEAN NOT NULL DEFAULT false,
    `allowsTextNote` BOOLEAN NOT NULL DEFAULT true,
    `supportsMultiplePickups` BOOLEAN NOT NULL DEFAULT false,
    `supportsMultipleDeliveries` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Service_key_key`(`key`),
    INDEX `Service_category_isActive_idx`(`category`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceField` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `labelAr` VARCHAR(191) NOT NULL,
    `type` ENUM('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTISELECT', 'IMAGE', 'LOCATION', 'DATE', 'TIME', 'BOOLEAN', 'PHONE') NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `options` JSON NULL,
    `validation` JSON NULL,
    `placeholder` VARCHAR(191) NULL,
    `placeholderAr` VARCHAR(191) NULL,
    `helpText` TEXT NULL,
    `helpTextAr` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServiceField_serviceId_sortOrder_idx`(`serviceId`, `sortOrder`),
    UNIQUE INDEX `ServiceField_serviceId_key_key`(`serviceId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `category` ENUM('DELIVERY', 'SHIPPING', 'MERCHANT') NOT NULL,
    `status` ENUM('NEW', 'UNDER_REVIEW', 'PRICED', 'AWAITING_CUSTOMER_APPROVAL', 'ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_ROUTE', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'NEW',
    `merchantId` VARCHAR(191) NULL,
    `assignedDriverId` VARCHAR(191) NULL,
    `customData` JSON NULL,
    `notes` TEXT NULL,
    `imageUrls` JSON NULL,
    `pickupLat` DECIMAL(10, 7) NULL,
    `pickupLng` DECIMAL(10, 7) NULL,
    `pickupAddress` VARCHAR(500) NULL,
    `deliveryLat` DECIMAL(10, 7) NULL,
    `deliveryLng` DECIMAL(10, 7) NULL,
    `deliveryAddress` VARCHAR(500) NULL,
    `weightKg` DECIMAL(8, 2) NULL,
    `sizeCategory` ENUM('SMALL', 'MEDIUM', 'LARGE') NULL,
    `isFragile` BOOLEAN NULL DEFAULT false,
    `speedTier` ENUM('STANDARD', 'EXPRESS') NULL DEFAULT 'STANDARD',
    `estimatedDistanceKm` DECIMAL(8, 2) NULL,
    `quotedPrice` DECIMAL(10, 2) NULL,
    `finalPrice` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
    `paymentMethod` ENUM('CASH', 'VODAFONE_CASH', 'INSTAPAY') NULL,
    `paymentStatus` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `customerApprovedAt` DATETIME(3) NULL,
    `pickedUpAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancellationReason` VARCHAR(500) NULL,
    `whatsappSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_orderNumber_key`(`orderNumber`),
    INDEX `Order_status_createdAt_idx`(`status`, `createdAt` DESC),
    INDEX `Order_customerId_createdAt_idx`(`customerId`, `createdAt` DESC),
    INDEX `Order_assignedDriverId_status_idx`(`assignedDriverId`, `status`),
    INDEX `Order_category_idx`(`category`),
    INDEX `Order_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productNameSnapshot` VARCHAR(191) NOT NULL,
    `unitPriceSnapshot` DECIMAL(10, 2) NULL,
    `quantity` INTEGER NOT NULL,
    `merchantId` VARCHAR(191) NULL,
    `pickupPointId` VARCHAR(191) NULL,
    `notes` VARCHAR(500) NULL,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderPickupPoint` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `merchantId` VARCHAR(191) NULL,
    `label` VARCHAR(191) NULL,
    `address` VARCHAR(500) NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `contactName` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `notes` VARCHAR(500) NULL,
    `arrivedAt` DATETIME(3) NULL,
    `pickedUpAt` DATETIME(3) NULL,

    INDEX `OrderPickupPoint_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderDeliveryPoint` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `recipientName` VARCHAR(191) NOT NULL,
    `recipientPhone` VARCHAR(191) NOT NULL,
    `address` VARCHAR(500) NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `notes` VARCHAR(500) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `proofImageUrl` VARCHAR(191) NULL,

    INDEX `OrderDeliveryPoint_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('NEW', 'UNDER_REVIEW', 'PRICED', 'AWAITING_CUSTOMER_APPROVAL', 'ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_ROUTE', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED') NULL,
    `toStatus` ENUM('NEW', 'UNDER_REVIEW', 'PRICED', 'AWAITING_CUSTOMER_APPROVAL', 'ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_ROUTE', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED') NOT NULL,
    `changedById` VARCHAR(191) NOT NULL,
    `changedByRole` ENUM('CUSTOMER', 'DRIVER', 'MERCHANT', 'ADMIN') NOT NULL,
    `reason` VARCHAR(500) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderStatusHistory_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `unit` VARCHAR(191) NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `stock` INTEGER NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Product_merchantId_isAvailable_idx`(`merchantId`, `isAvailable`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PricingRule` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `governorate` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `basePrice` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `pricePerKm` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `pricePerKg` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `minPrice` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `maxPrice` DECIMAL(10, 2) NULL,
    `fragileSurcharge` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `expressSurcharge` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `weekendMultiplier` DECIMAL(5, 2) NULL,
    `nightMultiplier` DECIMAL(5, 2) NULL,
    `nightStartHour` INTEGER NULL,
    `nightEndHour` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `effectiveFrom` DATETIME(3) NULL,
    `effectiveTo` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PricingRule_serviceId_isActive_idx`(`serviceId`, `isActive`),
    INDEX `PricingRule_governorate_idx`(`governorate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('CASH', 'VODAFONE_CASH', 'INSTAPAY') NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `referenceNumber` VARCHAR(191) NULL,
    `proofImageUrl` VARCHAR(191) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_orderId_idx`(`orderId`),
    INDEX `Payment_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('ORDER_STATUS', 'PROMO', 'SYSTEM', 'ALERT') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `titleAr` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `bodyAr` TEXT NOT NULL,
    `data` JSON NULL,
    `channel` ENUM('PUSH', 'WHATSAPP', 'IN_APP') NOT NULL DEFAULT 'IN_APP',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    INDEX `Notification_userId_isRead_sentAt_idx`(`userId`, `isRead`, `sentAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('PENDING_ORDER', 'DRIVER_NOT_RESPONDING', 'CASH_LIMIT_EXCEEDED', 'COMPLAINT', 'PAYMENT_PENDING') NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `title` VARCHAR(191) NOT NULL,
    `titleAr` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `descriptionAr` TEXT NOT NULL,
    `relatedOrderId` VARCHAR(191) NULL,
    `relatedUserId` VARCHAR(191) NULL,
    `isResolved` BOOLEAN NOT NULL DEFAULT false,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolutionNotes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Alert_isResolved_severity_createdAt_idx`(`isResolved`, `severity`, `createdAt` DESC),
    INDEX `Alert_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `titleAr` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(191) NOT NULL,
    `linkType` ENUM('SERVICE', 'MERCHANT', 'EXTERNAL', 'NONE') NOT NULL DEFAULT 'NONE',
    `linkValue` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Offer_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `description` VARCHAR(500) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userAgent` VARCHAR(500) NULL,
    `ip` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DriverProfile` ADD CONSTRAINT `DriverProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchantProfile` ADD CONSTRAINT `MerchantProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchantProfile` ADD CONSTRAINT `MerchantProfile_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Service` ADD CONSTRAINT `Service_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceField` ADD CONSTRAINT `ServiceField_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_assignedDriverId_fkey` FOREIGN KEY (`assignedDriverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_pickupPointId_fkey` FOREIGN KEY (`pickupPointId`) REFERENCES `OrderPickupPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderPickupPoint` ADD CONSTRAINT `OrderPickupPoint_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderDeliveryPoint` ADD CONSTRAINT `OrderDeliveryPoint_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `MerchantProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PricingRule` ADD CONSTRAINT `PricingRule_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_relatedOrderId_fkey` FOREIGN KEY (`relatedOrderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

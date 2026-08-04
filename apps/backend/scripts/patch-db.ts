import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding missing columns if needed...');
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE DriverProfile ADD COLUMN deliverySharePct DECIMAL(5,2) DEFAULT 0;`,
    );
    console.log('✅ Added deliverySharePct to DriverProfile');
  } catch (e: any) {
    if (e.message?.includes('Duplicate column') || e.message?.includes('1060')) {
      console.log('ℹ️ deliverySharePct column already exists');
    } else {
      console.warn('Warning on deliverySharePct:', e.message);
    }
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE User ADD COLUMN secondaryPhones JSON NULL;`);
    console.log('✅ Added secondaryPhones to User');
  } catch (e: any) {
    if (e.message?.includes('Duplicate column') || e.message?.includes('1060')) {
      console.log('ℹ️ secondaryPhones column already exists');
    } else {
      console.warn('Warning on secondaryPhones:', e.message);
    }
  }

  console.log('Done migration check!');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());

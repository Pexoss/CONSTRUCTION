import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { Rental } from '../src/modules/rentals/rental.model';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MIGRATION_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

const batchArg = process.argv.find((arg) => arg.startsWith('--batch='));
const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 100;

const log = (message: string) => console.log(message);

const computeDays = (start: Date, end: Date) => {
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const computeServiceSubtotal = (service: any) => {
  const quantity = service.quantity ?? 1;
  const price = service.price ?? 0;
  return Number((price * quantity).toFixed(2));
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri);
  log(`Connected to MongoDB. Dry run: ${isDryRun ? 'yes' : 'no'}`);

  const cursor = Rental.find().limit(limit || 0).cursor();

  let processed = 0;
  let updated = 0;
  let approvalsBackfilled = 0;

  for await (const rental of cursor) {
    processed += 1;
    const changeNotes: string[] = [];

    // Backfill item rentalType, unitPrice, subtotal
    for (const item of rental.items) {
      if (!item.rentalType) {
        item.rentalType = 'daily';
        changeNotes.push('items.rentalType');
      }
      if (item.subtotal === undefined && item.unitPrice !== undefined) {
        item.subtotal = Number((item.unitPrice * item.quantity).toFixed(2));
        changeNotes.push('items.subtotal');
      }
      if (item.unitPrice === undefined && item.subtotal !== undefined) {
        item.unitPrice = Number((item.subtotal / item.quantity).toFixed(2));
        changeNotes.push('items.unitPrice');
      }
    }

    // Backfill billingCycle
    if (!rental.dates.billingCycle) {
      rental.dates.billingCycle = rental.items[0]?.rentalType || 'daily';
      changeNotes.push('dates.billingCycle');
    }

    // Backfill services subtotal and service subtotals
    if (rental.services && rental.services.length > 0) {
      let servicesSubtotal = 0;
      for (const service of rental.services) {
        if (service.subtotal === undefined) {
          service.subtotal = computeServiceSubtotal(service);
          changeNotes.push('services.subtotal');
        }
        servicesSubtotal += service.subtotal || 0;
      }

      if (rental.pricing.servicesSubtotal === undefined) {
        rental.pricing.servicesSubtotal = Number(servicesSubtotal.toFixed(2));
        changeNotes.push('pricing.servicesSubtotal');
      }
    } else if (rental.pricing.servicesSubtotal === undefined) {
      rental.pricing.servicesSubtotal = 0;
      changeNotes.push('pricing.servicesSubtotal');
    }

    // Backfill pricing.originalEquipmentSubtotal
    if (rental.pricing.originalEquipmentSubtotal === undefined) {
      rental.pricing.originalEquipmentSubtotal = rental.pricing.equipmentSubtotal || 0;
      changeNotes.push('pricing.originalEquipmentSubtotal');
    }

    // Backfill contractedDays
    if (rental.pricing.contractedDays === undefined) {
      const contractedDays = computeDays(
        new Date(rental.dates.pickupScheduled),
        new Date(rental.dates.returnScheduled)
      );
      rental.pricing.contractedDays = contractedDays;
      changeNotes.push('pricing.contractedDays');
    }

    // Backfill usedDays
    if (rental.pricing.usedDays === undefined) {
      if (rental.dates.returnActual) {
        const start = rental.dates.pickupActual || rental.dates.pickupScheduled;
        rental.pricing.usedDays = computeDays(new Date(start), new Date(rental.dates.returnActual));
      } else {
        rental.pricing.usedDays = 0;
      }
      changeNotes.push('pricing.usedDays');
    }

    // Backfill pending approval ids
    if (rental.pendingApprovals && rental.pendingApprovals.length > 0) {
      for (const approval of rental.pendingApprovals) {
        if (!approval._id) {
          approval._id = new mongoose.Types.ObjectId();
          approvalsBackfilled += 1;
          changeNotes.push('pendingApprovals._id');
        }
      }
    }

    if (changeNotes.length > 0) {
      if (!rental.changeHistory) {
        rental.changeHistory = [];
      }

      rental.changeHistory.push({
        date: new Date(),
        changedBy: MIGRATION_USER_ID,
        changeType: 'migration_backfill',
        previousValue: '',
        newValue: changeNotes.join(', '),
        reason: 'auto-migration',
        approvedBy: MIGRATION_USER_ID,
      });
    }

    if (changeNotes.length > 0) {
      updated += 1;
      if (!isDryRun) {
        await rental.save();
      }
    }

    if (processed % batchSize === 0) {
      log(`Processed ${processed} rentals...`);
    }
  }

  log('Migration completed.');
  log(`Processed: ${processed}`);
  log(`Updated: ${updated}`);
  log(`Pending approvals backfilled: ${approvalsBackfilled}`);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

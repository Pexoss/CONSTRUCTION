import mongoose, { Schema, Model } from 'mongoose';
import { IBilling, IBillingItem, IBillingService, IBillingCalculation, IBillingEarlyReturn } from './billing.types';

const BillingItemSchema = new Schema<IBillingItem>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    unitId: {
      type: String,
      trim: true,
    },
    rentalLineKey: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    periodsCharged: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const BillingServiceSchema = new Schema<IBillingService>(
  {
    category: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const BillingCalculationSchema = new Schema<IBillingCalculation>(
  {
    baseRate: {
      type: Number,
      required: true,
      min: 0,
    },
    periodsCompleted: {
      type: Number,
      required: true,
      min: 0,
    },
    extraDays: {
      type: Number,
      required: true,
      min: 0,
    },
    chargeExtraPeriod: {
      type: Boolean,
      required: true,
      default: false,
    },
    baseAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    servicesAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountReason: String,
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const BillingEarlyReturnSchema = new Schema<IBillingEarlyReturn>(
  {
    isEarly: {
      type: Boolean,
      required: true,
      default: false,
    },
    daysSaved: {
      type: Number,
      required: true,
      min: 0,
    },
    discountApplied: {
      type: Number,
      required: true,
      min: 0,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { _id: false }
);

const BillingSchema = new Schema<IBilling>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    rentalId: {
      type: Schema.Types.ObjectId,
      ref: 'Rental',
      required: [true, 'Rental ID is required'],
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    billingNumber: {
      type: String,
      required: [true, 'Billing number is required'],
      unique: true,
    },
    billingDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    rentalType: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly'],
      required: true,
    },
    intervalChargeMode: {
      type: String,
      enum: ['floored', 'proportional'],
    },
    calculation: {
      type: BillingCalculationSchema,
      required: true,
    },
    earlyReturn: {
      type: BillingEarlyReturnSchema,
    },
    items: {
      type: [BillingItemSchema],
      required: true,
      default: [],
    },
    services: {
      type: [BillingServiceSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'paid', 'cancelled'],
      default: 'draft',
      index: true,
    },
    financialStage: {
      type: String,
      enum: ['pending', 'charge', 'invoiced', 'paid', 'cancelled'],
      default: 'pending',
      index: true,
    },
    governance: {
      type: String,
      enum: ['charge', 'invoice'],
      default: 'charge',
    },
    chargeId: {
      type: Schema.Types.ObjectId,
      ref: 'Charge',
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true,
    },
    outstandingAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    paymentHistory: {
      type: [
        {
          _id: false,
          amount: { type: Number, required: true, min: 0 },
          discount: { type: Number, min: 0, default: 0 },
          paidAt: { type: Date, required: true },
          paymentMethod: { type: String },
          notes: { type: String },
          origin: { type: String, enum: ['billing', 'charge', 'invoice'], required: true },
          originId: { type: String, required: true },
          createdBy: { type: String },
        },
      ],
      default: [],
    },
    approvalRequired: {
      type: Boolean,
      default: false,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvalDate: Date,
    approvalNotes: String,
    paymentDate: Date,
    paymentMethod: String,
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
BillingSchema.index({ companyId: 1, rentalId: 1 });
BillingSchema.index({ companyId: 1, customerId: 1 });
BillingSchema.index({ companyId: 1, status: 1 });
BillingSchema.index({ companyId: 1, billingDate: 1 });
// billingNumber index is automatically created by unique: true

const assignBillingNumber = async (doc: any) => {
  if (doc.billingNumber || !doc.companyId) return;

  const BillingModel = mongoose.model<IBilling>('Billing');
  const year = new Date().getFullYear();
  const prefix = `FCH-${year}-`;

  try {
    const companyId =
      doc.companyId instanceof mongoose.Types.ObjectId
        ? doc.companyId
        : new mongoose.Types.ObjectId(String(doc.companyId));

    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const [agg] = await BillingModel.aggregate([
      {
        $match: {
          companyId,
          billingNumber: { $regex: `^${escaped}\\d{6}$` },
        },
      },
      {
        $addFields: {
          seq: { $toInt: { $substrCP: ['$billingNumber', prefix.length, 6] } },
        },
      },
      { $group: { _id: null, maxSeq: { $max: '$seq' } } },
    ]);

    const nextSeq = (agg?.maxSeq ?? 0) + 1;
    doc.billingNumber = `${prefix}${String(nextSeq).padStart(6, '0')}`;
  } catch {
    doc.billingNumber = `FCH-${year}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

// Generate billing number before validation
BillingSchema.pre('validate', async function (next) {
  await assignBillingNumber(this);
  next();
});

// Pre-save hook (fallback)
BillingSchema.pre('save', async function (next) {
  await assignBillingNumber(this);
  if ((this as any).outstandingAmount === undefined || (this as any).outstandingAmount === null) {
    (this as any).outstandingAmount = Math.max(0, (this as any).calculation?.total || 0);
  }
  next();
});

export const Billing: Model<IBilling> = mongoose.model<IBilling>('Billing', BillingSchema);

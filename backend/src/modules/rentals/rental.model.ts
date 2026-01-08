import mongoose, { Schema, Model } from 'mongoose';
import { IRental, IRentalItem, IRentalDates, IRentalPricing, IRentalChecklist } from './rental.types';

const RentalItemSchema = new Schema<IRentalItem>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
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
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const RentalDatesSchema = new Schema<IRentalDates>(
  {
    reservedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    pickupScheduled: {
      type: Date,
      required: true,
    },
    pickupActual: {
      type: Date,
    },
    returnScheduled: {
      type: Date,
      required: true,
    },
    returnActual: {
      type: Date,
    },
  },
  { _id: false }
);

const RentalPricingSchema = new Schema<IRentalPricing>(
  {
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    deposit: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    lateFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const RentalChecklistSchema = new Schema<IRentalChecklist>(
  {
    photos: [String],
    conditions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    notes: String,
    completedAt: Date,
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { _id: false }
);

const RentalSchema = new Schema<IRental>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    rentalNumber: {
      type: String,
      required: [true, 'Rental number is required'],
      unique: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    items: {
      type: [RentalItemSchema],
      required: true,
      validate: {
        validator: (items: IRentalItem[]) => items.length > 0,
        message: 'At least one item is required',
      },
    },
    dates: {
      type: RentalDatesSchema,
      required: true,
    },
    pricing: {
      type: RentalPricingSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ['reserved', 'active', 'overdue', 'completed', 'cancelled'],
      default: 'reserved',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    checklistPickup: {
      type: RentalChecklistSchema,
    },
    checklistReturn: {
      type: RentalChecklistSchema,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
RentalSchema.index({ companyId: 1, status: 1 });
RentalSchema.index({ companyId: 1, customerId: 1 });
RentalSchema.index({ companyId: 1, 'dates.pickupScheduled': 1 });
RentalSchema.index({ companyId: 1, 'dates.returnScheduled': 1 });
RentalSchema.index({ rentalNumber: 1 });

// Pre-save hook to generate rental number if not provided
RentalSchema.pre('save', async function (next) {
  if (!this.rentalNumber && this.companyId) {
    try {
      // Use mongoose.model to get the model (works even if not yet exported)
      const RentalModel = mongoose.model<IRental>('Rental');
      const count = await RentalModel.countDocuments({ companyId: this.companyId });
      this.rentalNumber = `RENT-${this.companyId.toString().slice(-6)}-${String(count + 1).padStart(6, '0')}`;
    } catch (error) {
      // If model not found, use timestamp as fallback
      this.rentalNumber = `RENT-${Date.now()}`;
    }
  }
  next();
});

export const Rental: Model<IRental> = mongoose.model<IRental>('Rental', RentalSchema);

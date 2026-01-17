import mongoose, { Schema, Model } from 'mongoose';
import { IRental, IRentalItem, IRentalDates, IRentalPricing, IRentalChecklist, IRentalService, IRentalWorkAddress, IRentalChangeHistory, IRentalPendingApproval } from './rental.types';

const RentalItemSchema = new Schema<IRentalItem>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    // NOVO: Para itens unitários, especificar qual unidade
    unitId: {
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
    // NOVO: Tipo de aluguel (diária, semanal, etc.)
    rentalType: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly'],
      default: 'daily',
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

// NOVO: Schema para serviços adicionais
const RentalServiceSchema = new Schema<IRentalService>(
  {
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
    category: {
      type: String,
      required: true,
      trim: true,
    },
    notes: String,
  },
  { _id: false }
);

// NOVO: Schema para endereço da obra
const RentalWorkAddressSchema = new Schema<IRentalWorkAddress>(
  {
    street: {
      type: String,
      required: true,
    },
    number: String,
    complement: String,
    neighborhood: String,
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    zipCode: {
      type: String,
      required: true,
    },
    workName: {
      type: String,
      required: true,
    },
    workId: {
      type: Schema.Types.ObjectId,
    },
  },
  { _id: false }
);

// NOVO: Schema para histórico de alterações
const RentalChangeHistorySchema = new Schema<IRentalChangeHistory>(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changeType: {
      type: String,
      required: true,
    },
    previousValue: {
      type: String,
      required: true,
    },
    newValue: {
      type: String,
      required: true,
    },
    reason: String,
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { _id: false }
);

// NOVO: Schema para aprovações pendentes
const RentalPendingApprovalSchema = new Schema<IRentalPendingApproval>(
  {
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    requestType: {
      type: String,
      required: true,
    },
    requestDetails: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvalDate: Date,
    notes: String,
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
    // NOVO: Datas de fechamento periódico
    billingCycle: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly'],
    },
    lastBillingDate: Date,
    nextBillingDate: Date,
  },
  { _id: false }
);

const RentalPricingSchema = new Schema<IRentalPricing>(
  {
    equipmentSubtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    servicesSubtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
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
    discountReason: {
      type: String,
      trim: true,
    },
    discountApprovedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
      //required: [true, 'Rental number is required'], garado automaticamente pelo backend
      unique: true,
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
    
    // NOVO: Serviços adicionais
    services: {
      type: [RentalServiceSchema],
      default: [],
    },
    
    // NOVO: Endereço da obra
    workAddress: {
      type: RentalWorkAddressSchema,
    },
    
    dates: {
      type: RentalDatesSchema,
      required: true,
    },
    pricing: {
      type: RentalPricingSchema,
      required: true,
    },
    
    // NOVO: Histórico de alterações
    changeHistory: {
      type: [RentalChangeHistorySchema],
      default: [],
    },
    
    // NOVO: Solicitações pendentes
    pendingApprovals: {
      type: [RentalPendingApprovalSchema],
      default: [],
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
// rentalNumber index is automatically created by unique: true

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

import mongoose, { Schema, Model } from 'mongoose';
import { IInvoice } from './invoice.types';

const InvoiceItemSchema = new Schema(
  {
    description: {
      type: String,
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
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
    },
    rentalId: {
      type: Schema.Types.ObjectId,
      ref: 'Rental',
      index: true,
    },
    billingIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Billing' }],
      default: undefined,
    },
    chargeIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Charge' }],
      default: undefined,
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    obraDescription: {
      type: String,
      trim: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    items: {
      type: [InvoiceItemSchema],
      required: true,
      validate: {
        validator: (items: any[]) => items.length > 0,
        message: 'At least one item is required',
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      min: 0,
      default: 0,
    },
    discount: {
      type: Number,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'cancelled'],
      default: 'draft',
      index: true,
    },
    governsFinancialStatus: {
      type: Boolean,
      default: true,
    },
    issueDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: {
      type: Date,
    },
    terms: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    pdfPath: {
      type: String,
    },
    sentAt: {
      type: Date,
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
InvoiceSchema.index({ companyId: 1, status: 1 });
InvoiceSchema.index({ companyId: 1, customerId: 1 });
InvoiceSchema.index({ companyId: 1, rentalId: 1 });
InvoiceSchema.index({ companyId: 1, issueDate: 1 });
// invoiceNumber index is automatically created by unique: true

// Gera número antes da validação (validate roda antes de save; pre('save') era tarde demais)
InvoiceSchema.pre('validate', async function (next) {
  if (!this.invoiceNumber && this.companyId) {
    try {
      const InvoiceModel = mongoose.model<IInvoice>('Invoice');
      const count = await InvoiceModel.countDocuments({ companyId: this.companyId });
      this.invoiceNumber = String(count + 1).padStart(4, '0');
    } catch {
      this.invoiceNumber = String(Math.floor(Date.now() % 10000)).padStart(4, "0");
    }
  }
  next();
});

export const Invoice: Model<IInvoice> = mongoose.model<IInvoice>('Invoice', InvoiceSchema);

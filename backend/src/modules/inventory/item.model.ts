import mongoose, { Schema, Model } from 'mongoose';
import { IItem } from './item.types';

const ItemSchema = new Schema<IItem>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true,
    },
    subcategory: {
      type: String,
      trim: true,
      index: true,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
      sparse: true, // Permite null mas garante uniqueness quando presente
    },
    customId: {
      type: String,
      trim: true,
      sparse: true, // ID customizado manual
    },
    photos: {
      type: [String],
      default: [],
    },
    specifications: {
      type: Schema.Types.Mixed,
      default: {},
    },
    quantity: {
      total: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Total quantity cannot be negative'],
      },
      available: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Available quantity cannot be negative'],
      },
      rented: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Rented quantity cannot be negative'],
      },
      maintenance: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Maintenance quantity cannot be negative'],
      },
      damaged: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Damaged quantity cannot be negative'],
      },
    },
    pricing: {
      dailyRate: {
        type: Number,
        required: [true, 'Daily rate is required'],
        min: [0, 'Daily rate cannot be negative'],
      },
      weeklyRate: {
        type: Number,
        min: [0, 'Weekly rate cannot be negative'],
      },
      monthlyRate: {
        type: Number,
        min: [0, 'Monthly rate cannot be negative'],
      },
      depositAmount: {
        type: Number,
        min: [0, 'Deposit amount cannot be negative'],
      },
    },
    location: {
      type: String,
      trim: true,
    },
    depreciation: {
      initialValue: {
        type: Number,
        min: [0, 'Initial value cannot be negative'],
      },
      currentValue: {
        type: Number,
        min: [0, 'Current value cannot be negative'],
      },
      depreciationRate: {
        type: Number,
        min: [0, 'Depreciation rate cannot be negative'],
        max: [100, 'Depreciation rate cannot exceed 100%'],
      },
      purchaseDate: Date,
      lastDepreciationDate: Date,
    },
    lowStockThreshold: {
      type: Number,
      min: [0, 'Low stock threshold cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ItemSchema.index({ companyId: 1, sku: 1 }, { unique: true });
ItemSchema.index({ companyId: 1, barcode: 1 }, { sparse: true });
ItemSchema.index({ companyId: 1, customId: 1 }, { sparse: true });
ItemSchema.index({ companyId: 1, category: 1 });
ItemSchema.index({ companyId: 1, subcategory: 1 });
ItemSchema.index({ companyId: 1, isActive: 1 });
ItemSchema.index({ companyId: 1, 'quantity.available': 1 }); // Para alertas de estoque baixo

// Virtual para verificar se está em estoque baixo
ItemSchema.virtual('isLowStock').get(function () {
  if (this.lowStockThreshold && this.quantity.available <= this.lowStockThreshold) {
    return true;
  }
  return false;
});

export const Item: Model<IItem> = mongoose.model<IItem>('Item', ItemSchema);

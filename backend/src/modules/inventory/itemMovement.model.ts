import mongoose, { Schema, Model } from 'mongoose';
import { IItemMovement } from './item.types';

const ItemMovementSchema = new Schema<IItemMovement>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['in', 'out', 'rent', 'return', 'maintenance_start', 'maintenance_end', 'damage', 'repair', 'adjustment'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    previousQuantity: {
      total: Number,
      available: Number,
      rented: Number,
      maintenance: Number,
      damaged: Number,
    },
    newQuantity: {
      total: Number,
      available: Number,
      rented: Number,
      maintenance: Number,
      damaged: Number,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      // Referência pode ser para rental, maintenance, etc
    },
    notes: {
      type: String,
      trim: true,
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
ItemMovementSchema.index({ companyId: 1, itemId: 1, createdAt: -1 });
ItemMovementSchema.index({ companyId: 1, type: 1 });
ItemMovementSchema.index({ companyId: 1, createdAt: -1 });

export const ItemMovement: Model<IItemMovement> = mongoose.model<IItemMovement>('ItemMovement', ItemMovementSchema);

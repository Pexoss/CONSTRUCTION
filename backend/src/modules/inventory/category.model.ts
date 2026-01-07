import mongoose, { Schema, Model } from 'mongoose';
import { ICategory } from './item.types';

const CategorySchema = new Schema<ICategory>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
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

// Compound unique index
CategorySchema.index({ companyId: 1, name: 1 }, { unique: true });

export const Category: Model<ICategory> = mongoose.model<ICategory>('Category', CategorySchema);

import mongoose, { Schema, Model } from 'mongoose';
import { ISubcategory } from './item.types';

const SubcategorySchema = new Schema<ISubcategory>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Subcategory name is required'],
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
SubcategorySchema.index({ companyId: 1, categoryId: 1, name: 1 }, { unique: true });

export const Subcategory: Model<ISubcategory> = mongoose.model<ISubcategory>('Subcategory', SubcategorySchema);

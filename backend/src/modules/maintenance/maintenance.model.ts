import mongoose, { Schema, Model } from 'mongoose';
import { IMaintenance } from './maintenance.types';

const MaintenanceSchema = new Schema<IMaintenance>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: [true, 'Item ID is required'],
      index: true,
    },

    // NOVO: ID da unidade específica (se item for unitário)
    unitId: {
      type: String,
      trim: true,
      index: true,
    },

    type: {
      type: String,
      enum: ['preventive', 'corrective'],
      required: [true, 'Maintenance type is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    scheduledDate: {
      type: Date,
      required: [true, 'Scheduled date is required'],
      index: true,
    },

    // NOVO: Data de início
    startedDate: {
      type: Date,
    },

    completedDate: {
      type: Date,
    },

    // NOVO: Previsão de entrega
    expectedReturnDate: {
      type: Date,
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    cost: {
      type: Number,
      required: [true, 'Cost is required'],
      min: 0,
      default: 0,
    },

    // NOVO: Dados do fornecedor
    supplier: {
      type: {
        name: {
          type: String,
          trim: true,
        },
        cnpj: String,
        contact: String,
        phone: String,
      },
      required: false,
    },

    performedBy: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    attachments: {
      type: [String],
      default: [],
    },

    // NOVO: Flag de indisponibilidade do item
    itemUnavailable: {
      type: Boolean,
      default: true, // Por padrão, item fica indisponível durante manutenção
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
MaintenanceSchema.index({ companyId: 1, itemId: 1 });
MaintenanceSchema.index({ companyId: 1, status: 1 });
MaintenanceSchema.index({ companyId: 1, type: 1 });
MaintenanceSchema.index({ companyId: 1, scheduledDate: 1 });
MaintenanceSchema.index({ companyId: 1, itemId: 1, status: 1 });

export const Maintenance: Model<IMaintenance> = mongoose.model<IMaintenance>(
  'Maintenance',
  MaintenanceSchema
);

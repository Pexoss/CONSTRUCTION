import { Item } from './inventory.types';

export type MaintenanceType = 'preventive' | 'corrective';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed';

export interface Maintenance {
  _id: string;
  companyId: string;
  itemId: string | Item;
  unitId?: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduledDate: string;
  expectedReturnDate?: string;
  completedDate?: string;
  description: string;
  cost: number;
  itemUnavailable?: boolean;
  performedBy?: string;
  notes?: string;
  attachments: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMaintenanceData {
  itemId: string;
  unitId?: string;
  type: MaintenanceType;
  status?: MaintenanceStatus;
  scheduledDate: string;
  expectedReturnDate?: string;
  completedDate?: string;
  description: string;
  cost: number;
  itemUnavailable?: boolean;
  performedBy?: string;
  notes?: string;
  attachments?: string[];
}

export interface MaintenanceFilters {
  itemId?: string;
  type?: MaintenanceType;
  status?: MaintenanceStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface UpdateMaintenanceStatusData {
  status: MaintenanceStatus;
  completedDate?: string;
  performedBy?: string;
  notes?: string;
}

export interface MaintenanceStatistics {
  total: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  totalCost: number;
  byType: {
    preventive: number;
    corrective: number;
  };
}

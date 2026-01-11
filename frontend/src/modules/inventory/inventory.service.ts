import api from '../../config/api';
import {
  Item,
  ItemMovement,
  Category,
  Subcategory,
  CreateItemData,
  ItemFilters,
  AdjustQuantityData,
} from '../../types/inventory.types';

export const inventoryService = {
  // Items
  getItems: async (filters: ItemFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.category) params.append('category', filters.category);
    if (filters.subcategory) params.append('subcategory', filters.subcategory);
    if (filters.search) params.append('search', filters.search);
    if (filters.isActive !== undefined) params.append('isActive', String(filters.isActive));
    if (filters.lowStock) params.append('lowStock', 'true');
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: Item[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/inventory/items?${params.toString()}`);
    return response.data;
  },

  getItemById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Item }>(`/inventory/items/${id}`);
    return response.data;
  },

  createItem: async (data: CreateItemData) => {
    const response = await api.post<{ success: boolean; message: string; data: Item }>(
      '/inventory/items',
      data
    );
    return response.data;
  },

  updateItem: async (id: string, data: Partial<CreateItemData>) => {
    const response = await api.put<{ success: boolean; message: string; data: Item }>(
      `/inventory/items/${id}`,
      data
    );
    return response.data;
  },

  deleteItem: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/inventory/items/${id}`
    );
    return response.data;
  },

  adjustQuantity: async (id: string, data: AdjustQuantityData) => {
    const response = await api.post<{ success: boolean; message: string; data: Item }>(
      `/inventory/items/${id}/adjust-quantity`,
      data
    );
    return response.data;
  },

  getItemMovements: async (
    itemId: string,
    filters?: { type?: string; startDate?: string; endDate?: string; page?: number; limit?: number }
  ) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{ success: boolean; data: ItemMovement[]; total: number }>(
      `/inventory/items/${itemId}/movements?${params.toString()}`
    );
    return response.data;
  },

  getLowStockItems: async () => {
    const response = await api.get<{ success: boolean; data: Item[]; count: number }>(
      '/inventory/items/low-stock'
    );
    return response.data;
  },

  calculateDepreciation: async (id: string) => {
    const response = await api.post<{ success: boolean; message: string; data: Item }>(
      `/inventory/items/${id}/calculate-depreciation`
    );
    return response.data;
  },

  // Categories
  getCategories: async (isActive?: boolean) => {
    const params = new URLSearchParams();
    if (isActive !== undefined) params.append('isActive', String(isActive));

    const response = await api.get<{ success: boolean; data: Category[] }>(
      `/inventory/categories?${params.toString()}`
    );
    return response.data;
  },

  createCategory: async (data: { name: string; description?: string; isActive?: boolean }) => {
    const response = await api.post<{ success: boolean; message: string; data: Category }>(
      '/inventory/categories',
      data
    );
    return response.data;
  },

  updateCategory: async (id: string, data: Partial<{ name: string; description?: string; isActive?: boolean }>) => {
    const response = await api.put<{ success: boolean; message: string; data: Category }>(
      `/inventory/categories/${id}`,
      data
    );
    return response.data;
  },

  deleteCategory: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/inventory/categories/${id}`
    );
    return response.data;
  },

  // Subcategories
  getSubcategories: async (categoryId?: string, isActive?: boolean) => {
    const params = new URLSearchParams();
    if (categoryId) params.append('categoryId', categoryId);
    if (isActive !== undefined) params.append('isActive', String(isActive));

    const response = await api.get<{ success: boolean; data: Subcategory[] }>(
      `/inventory/subcategories?${params.toString()}`
    );
    return response.data;
  },

  createSubcategory: async (data: {
    categoryId: string;
    name: string;
    description?: string;
    isActive?: boolean;
  }) => {
    const response = await api.post<{ success: boolean; message: string; data: Subcategory }>(
      '/inventory/subcategories',
      data
    );
    return response.data;
  },

  updateSubcategory: async (
    id: string,
    data: Partial<{ categoryId: string; name: string; description?: string; isActive?: boolean }>
  ) => {
    const response = await api.put<{ success: boolean; message: string; data: Subcategory }>(
      `/inventory/subcategories/${id}`,
      data
    );
    return response.data;
  },

  deleteSubcategory: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/inventory/subcategories/${id}`
    );
    return response.data;
  },
};

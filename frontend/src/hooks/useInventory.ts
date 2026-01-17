import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '../modules/inventory/inventory.service';
import { CreateItemData, ItemFilters, AdjustQuantityData, EditItemData } from '../types/inventory.types';

export const useItems = (filters: ItemFilters = {}) => {
  return useQuery({
    queryKey: ['items', filters],
    queryFn: () => inventoryService.getItems(filters),
  });
};

export const useItem = (id: string) => {
  return useQuery({
    queryKey: ['item', id],
    queryFn: () => inventoryService.getItemById(id),
    enabled: !!id,
  });
};

export const useCreateItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateItemData) => inventoryService.createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useUpdateItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditItemData }) =>
      inventoryService.updateItem(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['item', variables.id] });
    },
  });
};

export const useDeleteItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inventoryService.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useAdjustQuantity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdjustQuantityData }) =>
      inventoryService.adjustQuantity(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['item', variables.id] });
    },
  });
};

export const useItemMovements = (itemId: string, filters?: any) => {
  return useQuery({
    queryKey: ['item-movements', itemId, filters],
    queryFn: () => inventoryService.getItemMovements(itemId, filters),
    enabled: !!itemId,
  });
};

export const useLowStockItems = () => {
  return useQuery({
    queryKey: ['items', 'low-stock'],
    queryFn: () => inventoryService.getLowStockItems(),
  });
};

export const useCalculateDepreciation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inventoryService.calculateDepreciation(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
  });
};

// Categories
export const useCategories = (isActive?: boolean) => {
  return useQuery({
    queryKey: ['categories', isActive],
    queryFn: () => inventoryService.getCategories(isActive),
  });
};

export const useCreateCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; description?: string; isActive?: boolean }) =>
      inventoryService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

export const useUpdateCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; description?: string; isActive?: boolean }> }) =>
      inventoryService.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

export const useDeleteCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inventoryService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

// Subcategories
export const useSubcategories = (categoryId?: string, isActive?: boolean) => {
  return useQuery({
    queryKey: ['subcategories', categoryId, isActive],
    queryFn: () => inventoryService.getSubcategories(categoryId, isActive),
    enabled: !categoryId || !!categoryId,
  });
};

export const useCreateSubcategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { categoryId: string; name: string; description?: string; isActive?: boolean }) =>
      inventoryService.createSubcategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
    },
  });
};

export const useUpdateSubcategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ categoryId: string; name: string; description?: string; isActive?: boolean }> }) =>
      inventoryService.updateSubcategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
    },
  });
};

export const useDeleteSubcategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inventoryService.deleteSubcategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] });
    },
  });
};

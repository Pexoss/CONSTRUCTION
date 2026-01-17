import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../../hooks/useInventory';
import { createCategorySchema } from '../../utils/inventory.validation';

const CategoriesPage: React.FC = () => {
  const { data: categoriesData, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', isActive: true });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = createCategorySchema.parse(formData);
      createCategory.mutate(validatedData, {
        onSuccess: () => {
          setShowCreateModal(false);
          setFormData({ name: '', description: '', isActive: true });
        },
        onError: (error: any) => {
          setErrors({
            submit: error?.response?.data?.message || 'Erro ao criar categoria.',
          });
        },
      });
    } catch (error: any) {
      if (error.errors) {
        const zodErrors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          zodErrors[err.path[0]] = err.message;
        });
        setErrors(zodErrors);
      }
    }
  };

  const handleUpdate = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = createCategorySchema.parse(formData);
      updateCategory.mutate(
        { id, data: validatedData },
        {
          onSuccess: () => {
            setEditingId(null);
            setFormData({ name: '', description: '', isActive: true });
          },
          onError: (error: any) => {
            setErrors({
              submit: error?.response?.data?.message || 'Erro ao atualizar categoria.',
            });
          },
        }
      );
    } catch (error: any) {
      if (error.errors) {
        const zodErrors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          zodErrors[err.path[0]] = err.message;
        });
        setErrors(zodErrors);
      }
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja deletar esta categoria?')) {
      deleteCategory.mutate(id);
    }
  };

  const startEdit = (category: any) => {
    setEditingId(category._id);
    setFormData({
      name: category.name,
      description: category.description || '',
      isActive: category.isActive,
    });
  };

  const categories = categoriesData?.data || [];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando categorias...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header - Apenas estilos alterados */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <Link to="/inventory/items" className="text-gray-600 hover:text-gray-900 mb-2 inline-block transition-colors">
                <div className="flex items-center">
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Voltar para Inventário
                </div>
              </Link>
              <h1 className="text-2xl font-semibold text-gray-900">Categorias</h1>
              <p className="mt-1 text-sm text-gray-600">Gerenciar categorias de itens</p>
            </div>
            <button
              onClick={() => {
                setShowCreateModal(true);
                setFormData({ name: '', description: '', isActive: true });
              }}
              className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              + Nova Categoria
            </button>
          </div>
        </div>

        {/* Categories List - Apenas estilos alterados */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {categories.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">Nenhuma categoria encontrada</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {categories.map((category) => (
                <li key={category._id} className="px-6 py-4">
                  {editingId === category._id ? (
                    <form onSubmit={(e) => handleUpdate(e, category._id)} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <input
                            type="text"
                            placeholder="Nome da categoria"
                            value={formData.name}
                            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                            required
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Descrição"
                            value={formData.description}
                            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-1 focus:ring-gray-400"
                          />
                          <span className="ml-2 text-sm text-gray-700">Ativo</span>
                        </label>
                        <div className="flex space-x-2">
                          <button
                            type="submit"
                            disabled={updateCategory.isPending}
                            className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                          >
                            {updateCategory.isPending ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setFormData({ name: '', description: '', isActive: true });
                            }}
                            className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{category.name}</h3>
                        {category.description && (
                          <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                        )}
                        <span
                          className={`mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${category.isActive
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : 'bg-red-100 text-red-800 border-red-200'
                            }`}
                        >
                          {category.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => startEdit(category)}
                          className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(category._id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Deletar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Create Modal - Apenas estilos alterados */}
      {showCreateModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setShowCreateModal(false)}
            />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-200">
              <form onSubmit={handleCreate}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Nova Categoria</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Nome *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                      />
                      {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Descrição</label>
                      <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                      />
                    </div>
                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-1 focus:ring-gray-400"
                        />
                        <span className="ml-2 text-sm text-gray-700">Categoria ativa</span>
                      </label>
                    </div>
                    {errors.submit && (
                      <div className="rounded-lg bg-red-50 p-4 border border-red-100">
                        <p className="text-sm text-red-800">{errors.submit}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={createCategory.isPending}
                    className="w-full inline-flex justify-center rounded-lg border border-transparent px-4 py-2 bg-gray-800 hover:bg-gray-900 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 transition-colors"
                  >
                    {createCategory.isPending ? 'Criando...' : 'Criar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;

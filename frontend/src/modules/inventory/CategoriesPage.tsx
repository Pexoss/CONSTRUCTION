import React, { useState } from "react";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "../../hooks/useInventory";
import { Link } from "react-router-dom";
import { createCategorySchema } from "../../utils/inventory.validation";
import Layout from "../../components/Layout";

const CategoriesPage: React.FC = () => {
  const { data: categoriesData, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = createCategorySchema.parse(formData);
      createCategory.mutate(validatedData, {
        onSuccess: () => {
          setShowCreateModal(false);
          setFormData({ name: "", description: "", isActive: true });
        },
        onError: (error: any) => {
          setErrors({
            submit:
              error?.response?.data?.message || "Erro ao criar categoria.",
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
            setFormData({ name: "", description: "", isActive: true });
          },
          onError: (error: any) => {
            setErrors({
              submit:
                error?.response?.data?.message ||
                "Erro ao atualizar categoria.",
            });
          },
        },
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
    if (window.confirm("Tem certeza que deseja deletar esta categoria?")) {
      deleteCategory.mutate(id);
    }
  };

  const startEdit = (category: any) => {
    setEditingId(category._id);
    setFormData({
      name: category.name,
      description: category.description || "",
      isActive: category.isActive,
    });
  };

  const categories = categoriesData?.data || [];

  if (isLoading) {
    return (
      <Layout title="Categorias" backTo="/inventory/items">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando categorias...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Categorias" backTo="/inventory/items">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <Link
              to="/inventory/items"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
            >
              ← Voltar para o Inventário
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-8">
            <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Categorias
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Gerenciar categorias de itens
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(true);
                  setFormData({ name: "", description: "", isActive: true });
                }}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                <svg
                  className="h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Nova Categoria
              </button>
            </div>
          </div>

          {/* Categories List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {categories.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                Nenhuma categoria encontrada
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {categories.map((category) => (
                  <div key={category._id} className="px-6 py-4">
                    {editingId === category._id ? (
                      <form
                        onSubmit={(e) => handleUpdate(e, category._id)}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <input
                              type="text"
                              placeholder="Nome da categoria"
                              value={formData.name}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                              className="block w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              required
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Descrição"
                              value={formData.description}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                }))
                              }
                              className="block w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.isActive}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  isActive: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-gray-500"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              Ativo
                            </span>
                          </label>
                          <div className="flex space-x-2">
                            <button
                              type="submit"
                              disabled={updateCategory.isPending}
                              className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                            >
                              {updateCategory.isPending
                                ? "Salvando..."
                                : "Salvar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setFormData({
                                  name: "",
                                  description: "",
                                  isActive: true,
                                });
                              }}
                              className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                            {category.name}
                          </h3>
                          {category.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {category.description}
                            </p>
                          )}
                          <span
                            className={`
                            mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border
                            ${
                              category.isActive
                                ? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-700"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700"
                            }
                          `}
                          >
                            {category.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => startEdit(category)}
                            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                          >
                            <svg
                              className="h-4 w-4 mr-2"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(category._id)}
                            className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                          >
                            <svg
                              className="h-4 w-4 mr-2"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            Deletar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed z-50 inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 transition-opacity"
                onClick={() => setShowCreateModal(false)}
              />
              <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-200 dark:border-gray-700">
                <form onSubmit={handleCreate}>
                  <div className="bg-white dark:bg-gray-800 px-6 py-5">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-4">
                        <svg
                          className="h-6 w-6 text-gray-800 dark:text-gray-200"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Nova Categoria
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Nome *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          className="block w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                        {errors.name && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            {errors.name}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Descrição
                        </label>
                        <textarea
                          rows={3}
                          value={formData.description}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          className="block w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                isActive: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-gray-500"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            Categoria ativa
                          </span>
                        </label>
                      </div>
                      {errors.submit && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 border border-red-100 dark:border-red-800/30">
                          <p className="text-sm text-red-800 dark:text-red-300">
                            {errors.submit}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 sm:flex sm:flex-row-reverse border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="submit"
                      disabled={createCategory.isPending}
                      className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {createCategory.isPending ? "Criando..." : "Criar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="mt-3 sm:mt-0 sm:mr-3 w-full sm:w-auto inline-flex justify-center items-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
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
    </Layout>
  );
};

export default CategoriesPage;

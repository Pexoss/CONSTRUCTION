import React, { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { customerService } from "./customer.service";
import { CustomerAddress } from "../../types/customer.types";

const CustomerAddressesPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customerAddresses", id],
    queryFn: () => customerService.getCustomerById(id!),
    enabled: !!id,
  });

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loadingAddressId, setLoadingAddressId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (data?.data?.addresses) {
      setAddresses(data.data.addresses);
    }
  }, [data]);

  const addMutation = useMutation({
    mutationFn: (address: CustomerAddress) =>
      customerService.addAddress(id!, address),
    onMutate: () => {
      setLoadingAddressId("new");
      setIsSaving(true);
    },
    onSuccess: (updatedCustomer) => {
      setAddresses(updatedCustomer.addresses ?? []);
      queryClient.invalidateQueries({ queryKey: ["customerAddresses", id] });
      setSuccessMessage("Endereço salvo com sucesso !");
      setLoadingAddressId(null);
      setIsSaving(false);
    },
    onError: (error: any) => {
      console.group("❌ ADD ADDRESS ERROR");
      console.error("Error object:", error);
      console.error("Backend response:", error?.response);
      console.error("Status:", error?.response?.status);
      console.error("Data:", error?.response?.data);
      console.groupEnd();

      setLoadingAddressId(null);
      setIsSaving(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      addressId,
      address,
    }: {
      addressId: string;
      address: CustomerAddress;
    }) => customerService.updateAddress(id!, addressId, address),
    onMutate: (variables) => {
      setLoadingAddressId(variables.addressId);
      setIsSaving(true);
    },
    onSuccess: (updatedCustomer) => {
      setAddresses(updatedCustomer.addresses ?? []);
      queryClient.invalidateQueries({ queryKey: ["customerAddresses", id] });
      setSuccessMessage("Endereço salvo com sucesso !");
      setLoadingAddressId(null);
      setIsSaving(false);
    },
    onError: (error: any) => {
      console.group("❌ UPDATE ADDRESS ERROR");
      console.error("Error object:", error);
      console.error("Backend response:", error?.response);
      console.error("Status:", error?.response?.status);
      console.error("Data:", error?.response?.data);
      console.groupEnd();

      setLoadingAddressId(null);
      setIsSaving(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (addressId: string) =>
      customerService.deleteAddress(id!, addressId),
    onMutate: (addressId) => {
      setLoadingAddressId(addressId);
    },
    onSuccess: (updatedCustomer) => {
      setAddresses(updatedCustomer.addresses ?? []);
      queryClient.invalidateQueries({ queryKey: ["customerAddresses", id] });
      setLoadingAddressId(null);
    },
    onError: () => {
      setLoadingAddressId(null);
    },
  });

  const handleAddAddress = () => {
    setAddresses([
      ...addresses,
      {
        addressName: "",
        type: "main",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        zipCode: "",
        country: "Brasil",
        isDefault: addresses.length === 0,
      },
    ]);
  };

  const handleSaveAddress = (address: CustomerAddress) => {
    console.group("📦 SAVE ADDRESS");
    console.log("➡️ Original address (state):", address);

    if (address._id) {
      console.log("✏️ Action: UPDATE");
      console.log("🆔 Address ID:", address._id);
      console.log("📤 Payload sent to backend:", address);

      updateMutation.mutate({ addressId: address._id, address });
    } else {
      console.log("➕ Action: CREATE");
      console.log("📤 Payload sent to backend:", address);

      addMutation.mutate(address);
    }

    console.groupEnd();
  };

  const handleChange = (
    index: number,
    field: keyof CustomerAddress,
    value: any,
  ) => {
    const newAddresses = [...addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    setAddresses(newAddresses);
  };

  // Verificar se um endereço específico está carregando
  const isAddressLoading = (addressId?: string): boolean => {
    if (!addressId) {
      return loadingAddressId === "new";
    }
    return loadingAddressId === addressId;
  };

  // Verificar se é uma operação de exclusão
  const isDeleting = (addressId?: string): boolean => {
    if (!addressId) return false;
    return deleteMutation.isPending && loadingAddressId === addressId;
  };

  if (isLoading) {
    return (
      <Layout title="Endereços do Cliente" backTo={`/customers/${id}`}>
        <div className="text-center py-16">Carregando...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Endereços do Cliente" backTo={`/customers/${id}`}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <Link
              to="/customers"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
            >
              <svg
                className="h-4 w-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              Voltar para Clientes
            </Link>
          </div>

          {/* Cabeçalho da Página */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Endereços do Cliente
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Gerencie os endereços cadastrados
              </p>
            </div>
            <button
              onClick={handleAddAddress}
              disabled={isSaving}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4"
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
              Adicionar Endereço
            </button>
          </div>

          {/* Mensagem de Sucesso */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  {successMessage}
                </p>
              </div>
            </div>
          )}

          {/* Lista de Endereços */}
          <div className="space-y-6">
            {addresses.map((address, index) => {
              const isLoading = isAddressLoading(address._id);
              const isDeletingAddress = isDeleting(address._id);

              return (
                <div
                  key={address._id || `new-${index}`}
                  className="relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6"
                >
                  {/* Overlay de loading */}
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center rounded-lg z-10 backdrop-blur-sm">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-400 rounded-full animate-spin mb-3"></div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {isDeletingAddress ? "Excluindo..." : "Salvando..."}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Cabeçalho do Card */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <svg
                          className="w-5 h-5 text-gray-700 dark:text-gray-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        {address.addressName ||
                          (address.type === "main"
                            ? "Endereço Principal"
                            : address.type === "billing"
                              ? "Endereço de Cobrança"
                              : address.type === "work"
                                ? "Endereço da Obra"
                                : "Outro Endereço")}
                      </h3>
                      {address.isDefault && (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-600">
                          Padrão
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Grid de Campos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Tipo de Endereço */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Tipo de Endereço
                      </label>
                      <select
                        value={address.type}
                        onChange={(e) =>
                          handleChange(index, "type", e.target.value)
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="main">Principal</option>
                        <option value="billing">Cobrança</option>
                        <option value="work">Obra</option>
                        <option value="other">Outro</option>
                      </select>
                    </div>

                    {/* Nome da Obra (condicional) */}
                    {address.type === "work" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Nome da Obra
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Condomínio Primavera"
                          value={address.addressName || ""}
                          onChange={(e) =>
                            handleChange(index, "addressName", e.target.value)
                          }
                          disabled={isLoading}
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    )}

                    {/* CEP */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        CEP
                      </label>
                      <input
                        type="text"
                        placeholder="00000-000"
                        value={address.zipCode || ""}
                        onChange={(e) =>
                          handleChange(index, "zipCode", e.target.value)
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Rua */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Rua
                      </label>
                      <input
                        type="text"
                        placeholder="Nome da rua"
                        value={address.street || ""}
                        onChange={(e) =>
                          handleChange(index, "street", e.target.value)
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Número */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Número
                      </label>
                      <input
                        type="text"
                        placeholder="123"
                        value={address.number || ""}
                        onChange={(e) =>
                          handleChange(index, "number", e.target.value)
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Complemento */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Complemento
                      </label>
                      <input
                        type="text"
                        placeholder="Apto, bloco, etc"
                        value={address.complement || ""}
                        onChange={(e) =>
                          handleChange(index, "complement", e.target.value)
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Bairro */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Bairro
                      </label>
                      <input
                        type="text"
                        placeholder="Centro"
                        value={address.neighborhood || ""}
                        onChange={(e) =>
                          handleChange(index, "neighborhood", e.target.value)
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Cidade */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Cidade
                      </label>
                      <input
                        type="text"
                        placeholder="São Paulo"
                        value={address.city || ""}
                        onChange={(e) =>
                          handleChange(index, "city", e.target.value)
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Estado */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Estado
                      </label>
                      <input
                        type="text"
                        placeholder="SP"
                        maxLength={2}
                        value={address.state || ""}
                        onChange={(e) =>
                          handleChange(
                            index,
                            "state",
                            e.target.value.toUpperCase(),
                          )
                        }
                        disabled={isLoading}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* País (fixo) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        País
                      </label>
                      <input
                        type="text"
                        value="Brasil"
                        disabled
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
                      />
                    </div>

                    {/* Checkbox Padrão */}
                    <div className="md:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={!!address.isDefault}
                            onChange={(e) =>
                              handleChange(index, "isDefault", e.target.checked)
                            }
                            disabled={isLoading}
                            className="sr-only"
                          />
                          <div
                            className={`w-4 h-4 border rounded transition-colors ${
                              address.isDefault
                                ? "bg-gray-900 dark:bg-gray-700 border-gray-900 dark:border-gray-600"
                                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                            }`}
                          >
                            {address.isDefault && (
                              <svg
                                className="w-3 h-3 mx-auto my-0.5 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth="3"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Definir como endereço padrão
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleSaveAddress(addresses[index])}
                      disabled={isLoading}
                      className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading && !isDeletingAddress ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Salvando...
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          Salvar
                        </>
                      )}
                    </button>

                    {address._id && (
                      <button
                        onClick={() => deleteMutation.mutate(address._id!)}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center px-4 py-2 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 rounded-lg text-sm font-medium transition-colors gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeletingAddress ? (
                          <>
                            <div className="w-4 h-4 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin"></div>
                            Excluindo...
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                              />
                            </svg>
                            Excluir
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CustomerAddressesPage;

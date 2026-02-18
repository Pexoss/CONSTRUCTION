import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { customerService } from "./customer.service";
import { CreateCustomerData, Customer } from "../../types/customer.types";
import Layout from "../../components/Layout";

const CreateCustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateCustomerData>({
    name: "",
    cpfCnpj: "",
    validateDocument: false,
    email: "",
    phone: "",
    notes: "",
    isBlocked: false,
  });
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(
    null,
  );
  const [balanceInfo, setBalanceInfo] = useState<{
    balance: number;
    documentType: "cpf" | "cnpj";
  } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [cpfCnpjEnabled, setCpfCnpjEnabled] = useState(false);
  const [cpfCnpjConfigLoading, setCpfCnpjConfigLoading] = useState(true);
  const [cpfPackageId, setCpfPackageId] = useState<string | null>(null);
  const [cnpjPackageId, setCnpjPackageId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateCustomerData) =>
      customerService.createCustomer(data),

    onSuccess: (customer) => {
      console.log("✅ Cliente criado:", customer);
      console.log("🆔 ID:", customer._id);

      setCreatedCustomerId(customer._id);
      setShowAddressModal(true);
    },

    onError: (error: any) => {
      console.error("❌ Erro ao criar cliente:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    console.log("📝 Submit acionado");
    console.log("📦 FormData atual:", formData);

    const payload: CreateCustomerData = { ...formData };
    if (payload.validateDocument) {
      delete payload.name;
    } else if (payload.name) {
      payload.name = payload.name.trim();
    }

    createMutation.mutate(payload);
  };

  React.useEffect(() => {
    let isMounted = true;
    setCpfCnpjConfigLoading(true);
    customerService
      .getCpfCnpjConfig()
      .then((data) => {
        if (!isMounted) return;
        const enabled = !!data.enabled;
        setCpfCnpjEnabled(enabled);
        setCpfPackageId(data.cpfPackageId || null);
        setCnpjPackageId(data.cnpjPackageId || null);
        if (!enabled) {
          setFormData((prev) => ({
            ...prev,
            validateDocument: false,
          }));
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setCpfCnpjEnabled(false);
        setCpfPackageId(null);
        setCnpjPackageId(null);
        setFormData((prev) => ({
          ...prev,
          validateDocument: false,
        }));
      })
      .finally(() => {
        if (!isMounted) return;
        setCpfCnpjConfigLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    const cpfCnpjDigits = formData.cpfCnpj.replace(/\D/g, "");
    const shouldCheckBalance =
      cpfCnpjEnabled &&
      formData.validateDocument &&
      (cpfCnpjDigits.length === 11 || cpfCnpjDigits.length === 14);

    if (!shouldCheckBalance) {
      setBalanceInfo(null);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);

    const timeoutId = setTimeout(() => {
      customerService
        .getCpfCnpjBalance(cpfCnpjDigits)
        .then((data) => {
          setBalanceInfo({
            balance: data.balance,
            documentType: data.documentType,
          });
        })
        .catch((error: any) => {
          const message =
            error?.response?.data?.message || "Não foi possível consultar o saldo";
          setBalanceError(message);
          setBalanceInfo(null);
        })
        .finally(() => {
          setBalanceLoading(false);
        });
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [formData.cpfCnpj, formData.validateDocument]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    const nextValue =
      type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : value;

    console.log(`✏️ Campo alterado: ${name}`, nextValue);

    setFormData((prev) => {
      if (name === "validateDocument" && nextValue === true) {
        if (!cpfCnpjEnabled) {
          return prev;
        }
        return {
          ...prev,
          validateDocument: true,
          name: "",
        };
      }

      if (name === "validateDocument" && nextValue === false) {
        return {
          ...prev,
          validateDocument: false,
        };
      }

      return {
        ...prev,
        [name]: nextValue,
      };
    });
  };

  return (
    <Layout title="Novo Cliente" backTo="/customers">
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

          {/* Cabeçalho */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Novo Cliente
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Cadastre um novo cliente no sistema
            </p>
          </div>

          {/* Card do Formulário */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Informações do Cliente
              </h2>
            </div>

            {createMutation.isError && (
              <div className="mx-6 mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-red-600 dark:text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    {createMutation.error instanceof Error
                      ? createMutation.error.message
                      : "Erro ao criar cliente"}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
              {/* Nome */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Nome {formData.validateDocument ? "" : "*"}
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required={!formData.validateDocument}
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ex: João da Silva"
                  disabled={formData.validateDocument}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                {formData.validateDocument && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Nome será preenchido automaticamente pela validação do CPF/CNPJ.
                  </p>
                )}
              </div>

              {/* CPF/CNPJ */}
              <div>
                <label
                  htmlFor="cpfCnpj"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  CPF/CNPJ *
                </label>
                <input
                  type="text"
                  id="cpfCnpj"
                  name="cpfCnpj"
                  required
                  value={formData.cpfCnpj}
                  onChange={handleChange}
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    name="validateDocument"
                    checked={!!formData.validateDocument}
                    onChange={handleChange}
                    disabled={!cpfCnpjEnabled || cpfCnpjConfigLoading}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-gray-900 focus:ring-gray-500"
                  />
                  Validar CPF/CNPJ pela API e preencher o nome automaticamente
                </label>
                {!cpfCnpjConfigLoading && !cpfCnpjEnabled && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Sua empresa ainda não configurou o token do CPF.CNPJ.
                  </p>
                )}
                {formData.validateDocument && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {balanceLoading && <span>Consultando saldo...</span>}
                    {!balanceLoading && balanceInfo && (
                      <span>
                        Saldo disponível ({balanceInfo.documentType.toUpperCase()}):{" "}
                        {balanceInfo.balance}
                      </span>
                    )}
                    {!balanceLoading && balanceError && (
                      <span className="text-red-600 dark:text-red-400">
                        {balanceError}
                      </span>
                    )}
                    {!balanceLoading && !balanceError && (
                      <div className="mt-1">
                        Pacote CPF: {cpfPackageId || "-"} • Pacote CNPJ:{" "}
                        {cnpjPackageId || "-"}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Email e Telefone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400 dark:text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                        />
                      </svg>
                    </div>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="cliente@email.com"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Telefone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400 dark:text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                        />
                      </svg>
                    </div>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(00) 00000-0000"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Observações
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Informações adicionais sobre o cliente..."
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                />
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate("/customers")}
                  className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {createMutation.isPending ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 mr-2 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 mr-2"
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
              </div>
            </form>
          </div>
        </div>

        {/* Modal de Sucesso */}
        {showAddressModal && createdCustomerId && (
          <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center mb-4">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg mr-3">
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
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Cliente criado com sucesso!
                </h2>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 ml-11">
                Agora você pode adicionar um endereço para este cliente.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowAddressModal(false);
                    navigate("/customers");
                  }}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Depois
                </button>
                <button
                  onClick={() =>
                    navigate(`/customers/${createdCustomerId}/addresses`)
                  }
                  className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Adicionar Endereço
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CreateCustomerPage;

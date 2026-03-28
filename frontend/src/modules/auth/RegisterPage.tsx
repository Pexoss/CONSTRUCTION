import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { registerCompanySchema } from "../../utils/validation";
import { RegisterCompanyData } from "../../types/auth.types";
import Logo from "../../assets/Logo.png";

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { registerCompany, isRegistering, registerError } = useAuth();
  const [count, setCount] = useState(5);
  const [formData, setFormData] = useState<RegisterCompanyData>({
    companyName: "",
    cnpj: undefined,
    email: "",
    phone: "",
    address: {
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "Brasil",
    },
    userName: "",
    userEmail: "",
    password: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [companyCode, setCompanyCode] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name.startsWith("address.")) {
      const addressField = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setCompanyCode(null);

    try {
      // Remove non-numeric characters from CNPJ
      const cleanCnpj = formData.cnpj?.replace(/\D/g, "");

      // Validate with Zod
      const validatedData = registerCompanySchema.parse({
        ...formData,
        cnpj: cleanCnpj,
      });
      // Register company
      const result = await registerCompany(
        validatedData as RegisterCompanyData,
      );

      if (result?.data?.company?.code) {
        setCompanyCode(result.data.company.code);
        setCount(5);
      }
    } catch (error: any) {
      if (error.errors) {
        // Zod validation errors
        const zodErrors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          zodErrors[err.path[0]] = err.message;
        });
        setErrors(zodErrors);
      }
    }
  };

  useEffect(() => {
    if (!companyCode) return;
    if (count <= 0) {
      navigate("/");
      return;
    }
    const timer = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(timer);
  }, [companyCode, count, navigate]);

  // Handle registration success/error via useEffect
  useEffect(() => {
    if (registerError) {
      setErrors({
        submit:
          (registerError as any)?.response?.data?.message ||
          "Erro ao registrar. Tente novamente.",
      });
    }
  }, [isRegistering, registerError, navigate]);

  if (companyCode) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0B2B4F] mb-2">
            Empresa registrada!
          </h1>
          <p className="text-gray-600 mb-4">Seu código de acesso é:</p>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <span className="font-mono text-2xl font-bold text-[#0B2B4F]">
              {companyCode}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Será utilizado para logar em sua conta. Guarde com segurança.
          </p>
          <p className="text-gray-600">
            Redirecionando em{" "}
            <span className="font-bold text-[#0B2B4F]">{count}</span>{" "}
            segundos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Main content */}
      <main className="flex-1 flex">
        {/* Left side - Hero section */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-tr from-[#0B2B4F] via-[#123B6A] to-[#1E3A8A] text-white flex-col justify-between p-16">
          {/* Conteúdo principal */}
          <div className="max-w-md">
            {/* Logo */}

            <div className="flex items-center gap-3 mb-16">
              <img src={Logo} alt="Logo" className="h-10" />
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-bold leading-tight mb-10">
              Gestão profissional de locação de equipamentos para empresas de
              construção
            </h1>

            {/* Benefícios */}
            <ul className="space-y-6">
              <li className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                  <svg
                    className="w-4 h-4 text-blue-300"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <span className="text-gray-200">
                  Gerencie equipamentos e controle todo o inventário
                </span>
              </li>

              <li className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                  <svg
                    className="w-4 h-4 text-blue-300"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <span className="text-gray-200">
                  Controle contratos de locação, prazos e vencimentos
                </span>
              </li>

              <li className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                  <svg
                    className="w-4 h-4 text-blue-300"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <span className="text-gray-200">
                  Acompanhe manutenções, custos e indicadores financeiros
                </span>
              </li>
            </ul>
          </div>

          {/* Footer */}
          <div className="text-sm text-gray-300">
            © 2026 Rental Construction. Todos os direitos reservados.
          </div>
        </div>
        {/* Right side - Register form */}
        <div className="w-full lg:w-1/2 flex items-start justify-center p-8 sm:p-12 lg:p-16 overflow-y-auto max-h-screen">
          <div className="w-full max-w-2xl">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Criar Nova Conta
              </h2>
              <p className="text-gray-600">
                Cadastre sua empresa e comece a gerenciar seus aluguéis
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Company Section */}
              <div className="space-y-6">
                <div className="pb-2 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Dados da Empresa
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label
                      htmlFor="companyName"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Nome da Empresa *
                    </label>
                    <input
                      id="companyName"
                      name="companyName"
                      type="text"
                      required
                      className={`block w-full px-4 py-3 rounded-lg border ${
                        errors.companyName
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                      } focus:ring-1 transition-colors`}
                      value={formData.companyName}
                      onChange={handleChange}
                      placeholder="Digite o nome da empresa"
                    />
                    {errors.companyName && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.companyName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="cnpj"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      CNPJ (opcional)
                    </label>
                    <input
                      id="cnpj"
                      name="cnpj"
                      type="text"
                      className={`block w-full px-4 py-3 rounded-lg border ${
                        errors.cnpj
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                      } focus:ring-1 transition-colors`}
                      value={formData.cnpj || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cnpj: e.target.value || undefined,
                        })
                      }
                      placeholder="00.000.000/0000-00"
                    />
                    {errors.cnpj && (
                      <p className="mt-2 text-sm text-red-600">{errors.cnpj}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email da Empresa *
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className={`block w-full px-4 py-3 rounded-lg border ${
                        errors.email
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                      } focus:ring-1 transition-colors`}
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="empresa@exemplo.com"
                    />
                    {errors.email && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Telefone (opcional)
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-1 focus:ring-[#0B2B4F] transition-colors"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-6">
                <div className="pb-2 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Endereço
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label
                      htmlFor="address.street"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Logradouro
                    </label>
                    <input
                      id="address.street"
                      name="address.street"
                      type="text"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-1 focus:ring-[#0B2B4F] transition-colors"
                      value={formData.address?.street}
                      onChange={handleChange}
                      placeholder="Rua, número, complemento"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="address.city"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Cidade
                    </label>
                    <input
                      id="address.city"
                      name="address.city"
                      type="text"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-1 focus:ring-[#0B2B4F] transition-colors"
                      value={formData.address?.city}
                      onChange={handleChange}
                      placeholder="São Paulo"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="address.state"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Estado
                    </label>
                    <input
                      id="address.state"
                      name="address.state"
                      type="text"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-1 focus:ring-[#0B2B4F] transition-colors"
                      value={formData.address?.state}
                      onChange={handleChange}
                      placeholder="SP"
                      maxLength={2}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="address.zipCode"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      CEP
                    </label>
                    <input
                      id="address.zipCode"
                      name="address.zipCode"
                      type="text"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-1 focus:ring-[#0B2B4F] transition-colors"
                      value={formData.address?.zipCode}
                      onChange={handleChange}
                      placeholder="00000-000"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="address.country"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      País
                    </label>
                    <input
                      id="address.country"
                      name="address.country"
                      type="text"
                      className="block w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 focus:border-[#0B2B4F] focus:ring-1 focus:ring-[#0B2B4F] transition-colors"
                      value={formData.address?.country}
                      onChange={handleChange}
                      readOnly
                    />
                  </div>
                </div>
              </div>

              {/* Admin User Section */}
              <div className="space-y-6">
                <div className="pb-2 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Usuário Administrador
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label
                      htmlFor="userName"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Nome Completo *
                    </label>
                    <input
                      id="userName"
                      name="userName"
                      type="text"
                      required
                      className={`block w-full px-4 py-3 rounded-lg border ${
                        errors.userName
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                      } focus:ring-1 transition-colors`}
                      value={formData.userName}
                      onChange={handleChange}
                      placeholder="Seu nome completo"
                    />
                    {errors.userName && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.userName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="userEmail"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email do Usuário *
                    </label>
                    <input
                      id="userEmail"
                      name="userEmail"
                      type="email"
                      required
                      className={`block w-full px-4 py-3 rounded-lg border ${
                        errors.userEmail
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                      } focus:ring-1 transition-colors`}
                      value={formData.userEmail}
                      onChange={handleChange}
                      placeholder="seu.email@exemplo.com"
                    />
                    {errors.userEmail && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.userEmail}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Senha *
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        className={`block w-full px-4 py-3 rounded-lg border ${
                          errors.password
                            ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                            : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                        } focus:ring-1 transition-colors pr-12`}
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Digite uma senha segura"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPassword ? (
                          <svg
                            className="h-5 w-5 text-gray-400 hover:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-5 w-5 text-gray-400 hover:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      mínimo 6 caracteres
                    </p>
                    {errors.password && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.password}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Messages */}
              {(errors.submit || registerError) && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-600">
                    {errors.submit ||
                      (registerError as any)?.response?.data?.message ||
                      "Erro ao registrar empresa"}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isRegistering}
                  className={`w-full py-3.5 px-4 rounded-lg font-medium text-white transition-colors ${
                    isRegistering
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-[#0B2B4F] hover:bg-[#0B2B4F]/90"
                  }`}
                >
                  {isRegistering ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5 text-white"
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
                      Processando...
                    </div>
                  ) : (
                    "Registrar Empresa"
                  )}
                </button>
              </div>

              {/* Login Link */}
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Já possui uma conta?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="text-[#0B2B4F] hover:text-[#0B2B4F]/80 font-medium"
                  >
                    Fazer login
                  </button>
                </p>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-gray-500">
                Ao se registrar, você concorda com nossos{" "}
                <Link to="/terms" className="text-[#0B2B4F] hover:underline">
                  Termos de Serviço
                </Link>{" "}
                e{" "}
                <Link to="/privacy" className="text-[#0B2B4F] hover:underline">
                  Política de Privacidade
                </Link>
              </div>
            </form>

            {/* Mobile footer */}
            <div className="mt-8 text-center text-sm text-gray-500 lg:hidden">
              © 2026 Rental Construction. Todos os direitos reservados.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RegisterPage;

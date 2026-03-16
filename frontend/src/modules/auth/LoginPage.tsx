import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { loginSchema } from "../../utils/validation";
import { LoginCredentials } from "../../types/auth.types";
import Logo from "../../assets/Logo.png";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoggingIn, loginError } = useAuth();
  const [formData, setFormData] = useState<LoginCredentials>({
    email: "",
    password: "",
    companyCode: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      // Validate with Zod
      loginSchema.parse(formData);

      // Login - will be handled by mutation callbacks
      login(formData);
    } catch (error: any) {
      if (error.errors) {
        const zodErrors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          zodErrors[err.path[0]] = err.message;
        });
        setErrors(zodErrors);
      } else if (error.response) {
        // Erros vindos do backend
        setErrors({
          submit:
            error.response.data?.message ||
            "Erro ao fazer login. Tente novamente.",
        });
      } else {
        setErrors({
          submit: error.message || "Erro inesperado. Tente novamente.",
        });
      }
    }
  };

  // Handle login success/error via useEffect
  useEffect(() => {
    if (!isLoggingIn && !loginError && localStorage.getItem("accessToken")) {
      navigate("/dashboard");
    }
    if (loginError) {
      setErrors({
        submit:
          (loginError as any)?.response?.data?.message ||
          "Erro ao fazer login. Tente novamente.",
      });
    }
  }, [isLoggingIn, loginError, navigate]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Main content */}
      <main className="flex-1 flex">
        {/* Left side - Hero section */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1E3A8A] to-[#0F172A] text-white flex-col justify-between p-16">
          <div className="max-w-md">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-16">
              <img src={Logo} alt="Logo" className="h-10" />
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-bold leading-tight mb-8">
              Gestão profissional de locação de equipamentos para sua empresa
            </h1>

            {/* Features */}
            <ul className="space-y-6 text-gray-200">
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                  ✓
                </div>
                <span>Gerencie equipamentos e inventário</span>
              </li>

              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                  ✓
                </div>
                <span>Controle contratos de locação e vencimentos</span>
              </li>

              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                  ✓
                </div>
                <span>Acompanhe manutenções e finanças</span>
              </li>
            </ul>
          </div>

          <div className="text-sm text-gray-400">
            © 2026 Rental Construction. Todos os direitos reservados.
          </div>
        </div>

        {/* Right side - Login form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-16">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Acesse sua conta
              </h2>
              <p className="text-gray-600">
                Digite suas credenciais para continuar
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Code */}
              <div>
                <label
                  htmlFor="companyCode"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Código da Empresa
                </label>
                <div className="relative">
                  <input
                    id="companyCode"
                    name="companyCode"
                    type="text"
                    required
                    className={`block w-full px-4 py-3 rounded-lg border ${
                      errors.companyCode
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                        : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                    } focus:ring-1 transition-colors`}
                    placeholder="Digite o código da empresa"
                    value={formData.companyCode}
                    onChange={handleChange}
                  />
                </div>
                {errors.companyCode && (
                  <p className="mt-2 text-sm text-red-600">
                    {errors.companyCode}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  E-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`block w-full px-4 py-3 rounded-lg border ${
                    errors.email
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                  } focus:ring-1 transition-colors`}
                  placeholder="voce@empresa.com"
                  value={formData.email}
                  onChange={handleChange}
                />
                {errors.email && (
                  <p className="mt-2 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-sm text-[#0B2B4F] hover:text-[#0B2B4F]/80 font-medium"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className={`block w-full px-4 py-3 rounded-lg border ${
                      errors.password
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                        : "border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F]"
                    } focus:ring-1 transition-colors pr-12`}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
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
                {errors.password && (
                  <p className="mt-2 text-sm text-red-600">{errors.password}</p>
                )}
              </div>

              {/* Error Messages */}
              {(errors.submit || loginError) && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-600">
                    {errors.submit ||
                      (loginError as any)?.response?.data?.message ||
                      "Erro ao fazer login"}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
                  isLoggingIn
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#0B2B4F] hover:bg-[#0B2B4F]/90"
                }`}
              >
                {isLoggingIn ? "Entrando..." : "Entrar"}
              </button>

              {/* Register Link */}
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Não tem uma conta?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/register")}
                    className="text-[#0B2B4F] hover:text-[#0B2B4F]/80 font-medium"
                  >
                    Criar conta da empresa
                  </button>
                </p>
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

export default LoginPage;

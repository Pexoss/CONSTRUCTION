import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../auth/auth.service";
import { RegisterUserData } from "../../types/auth.types";

const RegisterEmployeePage: React.FC = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<RegisterUserData>({
    name: "",
    email: "",
    password: "",
    role: "viewer",
    companyCode: "",
  });

  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrors({});
    setSuccessMessage("");

    if (formData.password !== confirmPassword) {
      setErrors({ confirmPassword: "As senhas não coincidem" });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await authService.registerUser(formData);

      if (res.success === false) {
        setErrors({
          submit: res.data.message || "Erro ao registrar usuário",
        });
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage("Funcionário registrado com sucesso!");

      setFormData({
        name: "",
        email: "",
        password: "",
        role: "viewer",
        companyCode: "",
      });

      setConfirmPassword("");

      setIsSubmitting(false);
    } catch (err: any) {
      setErrors({
        submit:
          err.response?.data?.message ||
          err.message ||
          "Erro inesperado",
      });

      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 flex">
        {/* LEFT SIDE */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1E3A8A] to-[#0F172A] text-white flex-col justify-between p-16">
          <div className="max-w-md">
            <div className="mb-16">
              <h1 className="text-4xl font-bold leading-tight mb-8">
                Gerencie os funcionários da sua empresa com facilidade
              </h1>

              <ul className="space-y-6 text-gray-200">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                    ✓
                  </div>
                  <span>Adicione novos funcionários à plataforma</span>
                </li>

                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                    ✓
                  </div>
                  <span>Defina níveis de acesso e permissões</span>
                </li>

                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center mt-1">
                    ✓
                  </div>
                  <span>Mantenha sua equipe organizada e segura</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-sm text-gray-400">
            © 2026 Rental Construction. Todos os direitos reservados.
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-16">
          <div className="w-full max-w-md">

            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Registrar funcionário
              </h2>
              <p className="text-gray-600">
                Adicione um novo membro à sua equipe
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome completo
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Digite o nome do funcionário"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F] focus:ring-1 transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  E-mail
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="funcionario@empresa.com"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F] focus:ring-1 transition-colors"
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Senha
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Digite uma senha"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F] focus:ring-1 transition-colors"
                />
              </div>

              {/* Confirmar senha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmar senha
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a senha"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F] focus:ring-1 transition-colors"
                />

                {errors.confirmPassword && (
                  <p className="mt-2 text-sm text-red-600">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Função
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F] focus:ring-1 transition-colors"
                >
                  <option value="admin">Administrador</option>
                  <option value="manager">Gerente</option>
                  <option value="operator">Operador</option>
                  <option value="viewer">Funcionário</option>
                </select>
              </div>

              {/* Company Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Código da empresa
                </label>
                <input
                  name="companyCode"
                  type="text"
                  required
                  value={formData.companyCode}
                  onChange={handleChange}
                  placeholder="Código da empresa"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#0B2B4F] focus:ring-[#0B2B4F] focus:ring-1 transition-colors"
                />
              </div>

              {errors.submit && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-600">{errors.submit}</p>
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                  <p className="text-sm text-green-700">{successMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
                  isSubmitting
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#0B2B4F] hover:bg-[#0B2B4F]/90"
                }`}
              >
                {isSubmitting ? "Registrando..." : "Registrar funcionário"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/employes")}
                className="text-sm text-[#0B2B4F] hover:text-[#0B2B4F]/80 font-medium"
              >
                Voltar para funcionários
              </button>

            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RegisterEmployeePage;
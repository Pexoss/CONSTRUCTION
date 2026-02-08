import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { registerCompanySchema } from '../../utils/validation';
import { RegisterCompanyData } from '../../types/auth.types';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { registerCompany, isRegistering, registerError } = useAuth();
  const [count, setCount] = useState(5);
  const [formData, setFormData] = useState<RegisterCompanyData>({
    companyName: '',
    cnpj: undefined,
    email: '',
    phone: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'Brasil',
    },
    userName: '',
    userEmail: '',
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [companyCode, setCompanyCode] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1];
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
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setCompanyCode(null);

    try {
      // Remove non-numeric characters from CNPJ
      const cleanCnpj = formData.cnpj?.replace(/\D/g, '');

      // Validate with Zod
      const validatedData = registerCompanySchema.parse({
        ...formData,
        cnpj: cleanCnpj,
      });
      // Register company
      const result = await registerCompany(validatedData as RegisterCompanyData);

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
      navigate('/login');
      return;
    }
    const timer = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(timer);
  }, [companyCode, count, navigate]);

  // Handle registration success/error via useEffect
  useEffect(() => {
    if (registerError) {
      setErrors({
        submit: (registerError as any)?.response?.data?.message || 'Erro ao registrar. Tente novamente.',
      });
    }
  }, [isRegistering, registerError, navigate]);

  if (companyCode) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4">
        <h1 className="text-2xl font-bold mb-4">Empresa registrada!</h1>
        <p className="text-lg mb-2">
          Seu código de acesso é:
          <span className="font-mono text-indigo-600 text-xl ml-2">{companyCode}</span>
        </p>
        <p className="mb-4">Será utilizado para logar em sua conta. Guarde com segurança.</p>
        <p>Redirecionando em {count}...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Logo/Brand */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="text-xl font-semibold">Rental Construction</span>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            Criar Nova Conta
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Cadastre sua empresa e comece a gerenciar seus aluguéis
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-4xl">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 py-8 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Company Section */}
              <div className="space-y-6">
                <div className="pb-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                      <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Dados da Empresa</h3>
                      <p className="text-sm text-gray-500">Informações da sua organização</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                      Nome da Empresa *
                    </label>
                    <input
                      id="companyName"
                      name="companyName"
                      type="text"
                      required
                      className={`w-full px-4 py-3 rounded-lg border ${errors.companyName ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'} focus:ring-2 focus:ring-opacity-20 transition-all duration-200`}
                      value={formData.companyName}
                      onChange={handleChange}
                      placeholder="Digite o nome da empresa"
                    />
                    {errors.companyName && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.companyName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-2">
                      CNPJ (opcional)
                    </label>
                    <input
                      id="cnpj"
                      name="cnpj"
                      type="text"
                      className={`w-full px-4 py-3 rounded-lg border ${errors.cnpj ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'} focus:ring-2 focus:ring-opacity-20 transition-all duration-200`}
                      value={formData.cnpj || ''}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value || undefined })}
                      placeholder="00.000.000/0000-00"
                    />
                    {errors.cnpj && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.cnpj}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email da Empresa *
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className={`w-full px-4 py-3 rounded-lg border ${errors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'} focus:ring-2 focus:ring-opacity-20 transition-all duration-200`}
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="empresa@exemplo.com"
                    />
                    {errors.email && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                      Telefone (opcional)
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-20 transition-all duration-200"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
              </div>

              {/* Admin User Section */}
              <div className="space-y-6">
                <div className="pb-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Usuário Administrador</h3>
                      <p className="text-sm text-gray-500">Dados do primeiro administrador</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
                      Nome Completo *
                    </label>
                    <input
                      id="userName"
                      name="userName"
                      type="text"
                      required
                      className={`w-full px-4 py-3 rounded-lg border ${errors.userName ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'} focus:ring-2 focus:ring-opacity-20 transition-all duration-200`}
                      value={formData.userName}
                      onChange={handleChange}
                      placeholder="Seu nome completo"
                    />
                    {errors.userName && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.userName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-2">
                      Email do Usuário *
                    </label>
                    <input
                      id="userEmail"
                      name="userEmail"
                      type="email"
                      required
                      className={`w-full px-4 py-3 rounded-lg border ${errors.userEmail ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'} focus:ring-2 focus:ring-opacity-20 transition-all duration-200`}
                      value={formData.userEmail}
                      onChange={handleChange}
                      placeholder="seu.email@exemplo.com"
                    />
                    {errors.userEmail && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.userEmail}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Senha *
                      <span className="ml-2 text-xs text-gray-500 font-normal">(mínimo 6 caracteres)</span>
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      className={`w-full px-4 py-3 rounded-lg border ${errors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'} focus:ring-2 focus:ring-opacity-20 transition-all duration-200`}
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Digite uma senha segura"
                    />
                    {errors.password && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.password}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Messages */}
              {(errors.submit || registerError) && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 animate-pulse-once">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800">
                        {errors.submit || (registerError as any)?.response?.data?.message || 'Erro ao registrar empresa'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isRegistering}
                  className={`w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl font-medium text-white transition-all duration-200 ${isRegistering
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-lg hover:shadow-xl active:scale-[0.99]'
                    } focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
                >
                  {isRegistering ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Registrar Empresa
                    </>
                  )}
                </button>
              </div>

              {/* Login Link */}
              <div className="pt-6 text-center">
                <p className="text-sm text-gray-600">
                  Já possui uma conta?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors focus:outline-none focus:underline"
                  >
                    Fazer login
                  </button>
                </p>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Ao se registrar, você concorda com nossos{' '}
            <Link to="/terms" className="text-indigo-600 hover:text-indigo-500">
              Termos de Serviço
            </Link>{' '}
            e{' '}
            <Link to="/privacy" className="text-indigo-600 hover:text-indigo-500">
              Política de Privacidade
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { loginSchema } from '../../utils/validation';
import { LoginCredentials } from '../../types/auth.types';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoggingIn, loginError } = useAuth();
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: '',
    companyCode: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
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
          submit: error.response.data?.message || 'Erro ao fazer login. Tente novamente.',
        });
      } else {
        setErrors({
          submit: error.message || 'Erro inesperado. Tente novamente.',
        });
      }
    }
  };

  // Handle login success/error via useEffect
  useEffect(() => {
    if (!isLoggingIn && !loginError && localStorage.getItem('accessToken')) {
      navigate('/dashboard');
    }
    if (loginError) {
      setErrors({
        submit: (loginError as any)?.response?.data?.message || 'Erro ao fazer login. Tente novamente.',
      });
    }
  }, [isLoggingIn, loginError, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sistema de Gestão de Aluguel
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Faça login na sua conta
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="companyCode" className="sr-only">
                Código de acesso
              </label>
              <input
                id="companyCode"
                name="companyCode"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Código de acesso"
                value={formData.companyCode}
                onChange={handleChange}
              />
              {errors.companyCode && (
                <p className="mt-1 text-sm text-red-600">{errors.companyCode}</p>
              )}
            </div>
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email"
                value={formData.email}
                onChange={handleChange}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Senha"
                value={formData.password}
                onChange={handleChange}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>
          </div>

          {errors.submit && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{errors.submit}</p>
            </div>
          )}

          {loginError && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">
                {(loginError as any)?.response?.data?.message || 'Erro ao fazer login'}
              </p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Não tem uma conta? Registre-se
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

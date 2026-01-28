import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from './auth.service';
import { RegisterUserData } from '../../types/auth.types';

const RegisterEmployeePage: React.FC = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<RegisterUserData>({
    name: '',
    email: '',
    password: '',
    role: 'viewer',
    companyCode: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const res = await authService.registerUser(formData);

      if (res.success === false) {
        setErrors({ submit: res.data.message || 'Erro ao registrar usuário' });
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage('Funcionário registrado com sucesso!');
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'viewer',
        companyCode: '',
      });

      setIsSubmitting(false);
      // Redirecionar ou limpar formulário
      // navigate('/login');

    } catch (err: any) {
      setErrors({
        submit: err.response?.data?.message || err.message || 'Erro inesperado',
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">Registrar Funcionário</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Preencha os dados do funcionário e o código da empresa
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Nome */}
          <div>
            <label htmlFor="name" className="sr-only">Nome</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Nome"
              value={formData.name}
              onChange={handleChange}
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="sr-only">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>

          {/* Senha */}
          <div>
            <label htmlFor="password" className="sr-only">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Senha"
              value={formData.password}
              onChange={handleChange}
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
          </div>

          {/* Role */}
          <div>
            <label htmlFor="role" className="sr-only">Função</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 bg-white placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="admin">Administrador (Admin)</option>
              <option value="manager">Gerente (Manager)</option>
              <option value="operator">Operador (Operator)</option>
              <option value="viewer">Funcionário (Viewer)</option>
            </select>
          </div>

          {/* Código da empresa */}
          <div>
            <label htmlFor="companyCode" className="sr-only">Código da Empresa</label>
            <input
              id="companyCode"
              name="companyCode"
              type="text"
              placeholder="Código da Empresa"
              value={formData.companyCode}
              onChange={handleChange}
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
            {errors.companyCode && <p className="mt-1 text-sm text-red-600">{errors.companyCode}</p>}
          </div>

          {/* Erro submit */}
          {errors.submit && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{errors.submit}</p>
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}

          {/* Botão */}
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Registrando...' : 'Registrar Funcionário'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Voltar para tela de escolha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterEmployeePage;

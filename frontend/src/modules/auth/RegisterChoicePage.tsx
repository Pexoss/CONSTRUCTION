import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Building, User } from 'lucide-react';

const RegisterChoicePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Header/Brand */}
      <div className="sm:mx-auto sm:w-full sm:max-w-4xl mb-12">
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-3">
              <div className="p-3 bg-gray-900 rounded-xl shadow-md">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="text-left">
                <h1 className="text-3xl font-bold text-gray-900">Rental Construction</h1>
                <p className="text-sm text-gray-600 font-medium">Sistema Profissional de Gestão</p>
              </div>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Portal de Acesso
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Selecione uma opção para acessar o sistema de gestão de aluguéis
          </p>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="sm:mx-auto sm:w-full sm:max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card: Login */}
          <div
            onClick={() => navigate('/login')}
            className="group cursor-pointer bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center text-center hover:border-gray-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="p-4 bg-gray-50 rounded-xl mb-6 group-hover:bg-gray-100 transition-colors">
              <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Acessar Sistema
            </h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Faça login na sua conta para gerenciar aluguéis, clientes e relatórios.
            </p>
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
              Entrar →
            </div>
          </div>

          {/* Card: Registrar Nova Empresa */}
          <div
            onClick={() => navigate('/register')}
            className="group cursor-pointer bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center text-center hover:border-gray-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="p-4 bg-gray-50 rounded-xl mb-6 group-hover:bg-gray-100 transition-colors">
              <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Nova Empresa
            </h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Cadastre sua empresa e crie a conta administrativa inicial.
            </p>
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
              Registrar →
            </div>
          </div>

          {/* Card: Novo Funcionário */}
          <div
            onClick={() => navigate('/registerUser')}
            className="group cursor-pointer bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center text-center hover:border-gray-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="p-4 bg-gray-50 rounded-xl mb-6 group-hover:bg-gray-100 transition-colors">
              <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 7.5a2.5 2.5 0 01-2.5 2.5H5.5A2.5 2.5 0 013 19.5v-15A2.5 2.5 0 015.5 2h13A2.5 2.5 0 0121 4.5v15a2.5 2.5 0 01-2.5 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Adicionar Colaborador
            </h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Registre um novo membro na equipe utilizando o código da empresa.
            </p>
            <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
              Adicionar →
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-12 mb-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-gray-50 text-sm text-gray-500">Suporte</span>
            </div>
          </div>
        </div>

        {/* Support Info */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Dúvidas ou problemas?{' '}
            <button className="text-gray-700 hover:text-gray-900 font-medium transition-colors underline">
              Contatar suporte técnico
            </button>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-4xl pt-6 border-t border-gray-200">
        <div className="text-center">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} Rental Construction - Sistema de Gestão de Aluguéis
            <br />
            <span className="text-gray-400">v1.0 • Todos os direitos reservados</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterChoicePage;

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Building, User } from 'lucide-react';

const RegisterChoicePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Card: Login */}
        <div
          onClick={() => navigate('/login')}
          className="cursor-pointer bg-white rounded-lg shadow-lg p-8 flex flex-col items-center justify-center hover:shadow-2xl transition-shadow duration-300"
        >
          <Key className="text-indigo-600 w-16 h-16 mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Login</h2>
          <p className="text-gray-600 text-center">
            Entre na sua conta e acesse o sistema.
          </p>
        </div>

        {/* Card: Registrar Nova Empresa */}
        <div
          onClick={() => navigate('/register')}
          className="cursor-pointer bg-white rounded-lg shadow-lg p-8 flex flex-col items-center justify-center hover:shadow-2xl transition-shadow duration-300"
        >
          <Building className="text-indigo-600 w-16 h-16 mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Registrar Nova Empresa</h2>
          <p className="text-gray-600 text-center">
            Crie uma nova empresa na plataforma e configure o superadmin.
          </p>
        </div>

        {/* Card: Novo Funcionário */}
        <div
          onClick={() => navigate('/registerUser')}
          className="cursor-pointer bg-white rounded-lg shadow-lg p-8 flex flex-col items-center justify-center hover:shadow-2xl transition-shadow duration-300"
        >
          <User className="text-indigo-600 w-16 h-16 mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Registrar Novo Funcionário</h2>
          <p className="text-gray-600 text-center">
            Adicione um funcionário a uma empresa existente usando o código de acesso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterChoicePage;

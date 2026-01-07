# Sistema de Gestão de Aluguel e Estoque de Materiais de Construção

Sistema SaaS multi-tenant completo para gestão de aluguel, estoque, manutenção e controle financeiro de materiais de construção.

## Stack Tecnológica

### Backend
- Node.js com Express
- TypeScript
- MongoDB com Mongoose
- JWT para autenticação
- Zod para validação
- Helmet para segurança
- Express Rate Limit

### Frontend
- React 18+ com TypeScript
- React Router para roteamento
- React Query para gerenciamento de estado servidor
- Zustand para gerenciamento de estado cliente
- Axios para requisições HTTP
- Tailwind CSS para estilização
- Zod para validação

## Estrutura do Projeto

```
.
├── backend/          # API Node.js/Express
│   ├── src/
│   │   ├── config/       # Configurações (DB, env)
│   │   ├── modules/      # Módulos da aplicação
│   │   │   ├── auth/     # Autenticação
│   │   │   ├── companies/# Empresas/tenants
│   │   │   └── users/    # Usuários
│   │   └── shared/       # Código compartilhado
│   └── package.json
│
└── frontend/         # Aplicação React
    ├── src/
    │   ├── modules/      # Módulos da aplicação
    │   ├── components/   # Componentes React
    │   ├── hooks/        # Hooks customizados
    │   ├── store/        # Zustand stores
    │   └── config/       # Configurações (API)
    └── package.json
```

## Instalação

### Pré-requisitos
- Node.js 18+ 
- MongoDB 6+ (local ou MongoDB Atlas)
- npm ou yarn

### Backend

1. Entre na pasta do backend:
```bash
cd backend
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/construction-rental
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-jwt-key-change-in-production-min-32-chars
CORS_ORIGIN=http://localhost:3001
```

4. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3000`

### Frontend

1. Entre na pasta do frontend:
```bash
cd frontend
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com a URL da API:
```env
REACT_APP_API_URL=http://localhost:3000/api
```

4. Inicie o servidor de desenvolvimento:
```bash
npm start
```

A aplicação estará rodando em `http://localhost:3001`

## Funcionalidades Implementadas (Fase 1)

### ✅ Autenticação
- Registro de empresa com primeiro usuário (superadmin)
- Login com JWT (access + refresh tokens)
- Refresh automático de tokens
- Logout
- Proteção de rotas

### ✅ Multi-Tenancy
- Identificação de tenant via header `X-Company-Id`
- Validação de empresa ativa
- Isolamento de dados por empresa

### ✅ Usuários
- Sistema de roles (superadmin, admin, manager, operator, viewer)
- Hash de senhas com bcrypt
- Validação de dados com Zod

### ✅ Frontend
- Páginas de Login e Registro
- Dashboard básico
- Gerenciamento de estado com Zustand
- Integração com API usando React Query
- Validação de formulários
- Feedback visual de erros

## API Endpoints

### Autenticação

- `POST /api/auth/register` - Registro de nova empresa
- `POST /api/auth/login` - Login (retorna tokens)
- `POST /api/auth/refresh` - Refresh de access token
- `POST /api/auth/register/user` - Registro de novo usuário (requer auth)
- `GET /api/auth/me` - Dados do usuário autenticado (requer auth)

### Headers Necessários

Para rotas protegidas:
- `Authorization: Bearer <access_token>`
- `X-Company-Id: <company_id>` (para identificar o tenant)

## Desenvolvimento

### Backend
```bash
npm run dev      # Desenvolvimento com hot reload
npm run build    # Build para produção
npm start        # Rodar build de produção
```

### Frontend
```bash
npm start        # Desenvolvimento com hot reload
npm run build    # Build para produção
npm test         # Rodar testes
```

## Próximas Fases

- [ ] Módulo de Inventário
- [ ] Módulo de Clientes
- [ ] Módulo de Aluguéis
- [ ] Módulo de Manutenção
- [ ] Módulo de Faturas
- [ ] Módulo Financeiro
- [ ] Módulo de Relatórios
- [ ] Módulo de Assinaturas

## Checkpoints

O projeto foi implementado com checkpoints para facilitar retomada:

1. ✅ Backend configurado + MongoDB conectado
2. ✅ Multi-tenancy funcionando
3. ✅ Schemas de Company e User criados
4. ✅ Autenticação backend completa
5. ✅ Frontend configurado + integração com API
6. ✅ UI de autenticação funcional

## Notas de Desenvolvimento

- O sistema usa JWT com access tokens de curta duração (15min) e refresh tokens de longa duração (7 dias)
- O multi-tenancy atualmente usa header `X-Company-Id`. Futuramente será implementado via subdomain
- As senhas são hasheadas com bcrypt (10 salt rounds)
- Validação de dados é feita com Zod tanto no backend quanto no frontend
- Rate limiting está configurado para prevenir abuso de APIs

## Licença

Este projeto é privado e proprietário.

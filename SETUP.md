# Guia de Setup Rápido

## Checklist de Verificação

### Backend

- [x] Estrutura de pastas criada
- [x] package.json configurado com todas as dependências
- [x] TypeScript configurado (tsconfig.json)
- [x] Variáveis de ambiente documentadas (.env.example)
- [x] Conexão MongoDB configurada
- [x] Middleware de multi-tenancy implementado
- [x] Middleware de autenticação JWT implementado
- [x] Middleware de tratamento de erros implementado
- [x] Schemas MongoDB (Company, User)
- [x] Módulo de autenticação completo
- [x] Servidor Express configurado e funcionando

### Frontend

- [x] Projeto React criado com TypeScript
- [x] Dependências instaladas (React Query, Zustand, Axios, Tailwind)
- [x] Tailwind CSS configurado
- [x] Configuração da API (Axios com interceptors)
- [x] Store de autenticação (Zustand)
- [x] Hook useAuth implementado
- [x] Página de Login
- [x] Página de Registro
- [x] Dashboard básico
- [x] Rotas protegidas
- [x] Validação de formulários com Zod

## Testes Manuais

### 1. Testar Backend

```bash
cd backend
npm install
# Criar arquivo .env com as variáveis necessárias
npm run dev
```

Verificar:
- Servidor inicia sem erros
- Health check: `GET http://localhost:3000/health`
- Resposta: `{ "success": true, "message": "Server is running" }`

### 2. Testar Registro de Empresa

```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "companyName": "Empresa Teste",
  "cnpj": "12345678000190",
  "email": "empresa@teste.com",
  "userName": "Admin Teste",
  "userEmail": "admin@teste.com",
  "password": "senha123"
}
```

Verificar:
- Status 201
- Retorna company, user e tokens
- Empresa criada no MongoDB
- Usuário criado com role 'superadmin'

### 3. Testar Login

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@teste.com",
  "password": "senha123",
  "companyId": "<company_id_do_registro>"
}
```

Verificar:
- Status 200
- Retorna user e tokens (accessToken, refreshToken)
- lastLogin atualizado no banco

### 4. Testar Rota Protegida

```bash
GET http://localhost:3000/api/auth/me
Authorization: Bearer <access_token>
X-Company-Id: <company_id>
```

Verificar:
- Status 200
- Retorna dados do usuário autenticado

### 5. Testar Frontend

```bash
cd frontend
npm install
# Criar arquivo .env com REACT_APP_API_URL=http://localhost:3000/api
npm start
```

Verificar:
- Aplicação abre em http://localhost:3001
- Página de login carrega
- É possível registrar nova empresa
- É possível fazer login
- Dashboard aparece após login
- Logout funciona

## Próximos Passos

Após verificar que tudo está funcionando:

1. Configurar MongoDB Atlas (produção) ou usar MongoDB local
2. Alterar JWT secrets para valores seguros
3. Implementar módulos seguintes conforme roadmap
4. Adicionar testes automatizados
5. Configurar CI/CD

## Problemas Comuns

### Backend não conecta ao MongoDB
- Verificar se MongoDB está rodando
- Verificar MONGODB_URI no .env
- Verificar se a porta está correta

### Erro de CORS no frontend
- Verificar CORS_ORIGIN no .env do backend
- Garantir que a URL do frontend está configurada corretamente

### Token expirado
- Tokens de acesso expiram em 15 minutos
- O sistema deve fazer refresh automático
- Se não funcionar, fazer logout e login novamente

### Erro de validação
- Verificar formato dos dados enviados
- CNPJ deve ter exatamente 14 dígitos
- Email deve ser válido
- Senha deve ter no mínimo 6 caracteres

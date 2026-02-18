# Como Configurar as Variáveis de Ambiente

## ⚠️ IMPORTANTE

As variáveis de ambiente devem estar no arquivo **`.env`** na raiz da pasta `backend`, **NÃO** no arquivo `env.ts`!

## Passos para Configurar

1. **Crie o arquivo `.env` na pasta `backend/`** (se ainda não existir)

2. **Copie o conteúdo abaixo e cole no arquivo `.env`:**

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB
# Altere para sua conexão MongoDB (local ou MongoDB Atlas)
MONGODB_URI=mongodb://localhost:27017/construction-rental

# JWT Secrets (mínimo 32 caracteres cada)
# IMPORTANTE: Altere estes valores para strings seguras em produção!
JWT_SECRET=8k9mP2nQ5rT8vW1xZ4aC7dF0gH3jK6lN9pL2mN5oQ8rT1uW4xZ7aB0cD3eF6gH9j
JWT_REFRESH_SECRET=9pL2mN5oQ8rT1uW4xZ7aB0cD3eF6gH9jK2mN5oQ8rT1uW4xZ7aB0cD3eF6gH9j
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS (URL do frontend)
CORS_ORIGIN=http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CPF.CNPJ API
CPFCNPJ_API_BASE_URL=https://api.cpfcnpj.com.br
CPFCNPJ_API_TOKEN=SEU_TOKEN_AQUI
CPFCNPJ_CPF_PACKAGE_ID=1
CPFCNPJ_CNPJ_PACKAGE_ID=4
CPFCNPJ_TIMEOUT_MS=60000
```

3. **Altere os valores conforme necessário:**
   - `MONGODB_URI`: Sua string de conexão do MongoDB
   - `JWT_SECRET`: Uma string aleatória de pelo menos 32 caracteres
   - `JWT_REFRESH_SECRET`: Outra string aleatória de pelo menos 32 caracteres
   - `CORS_ORIGIN`: URL do seu frontend (padrão: http://localhost:3001)
   - `CPFCNPJ_API_TOKEN`: Token gerado no painel do CPF.CNPJ
   - `CPFCNPJ_CPF_PACKAGE_ID`: Pacote de CPF (A = 1, B = 7)
   - `CPFCNPJ_CNPJ_PACKAGE_ID`: Pacote de CNPJ (A = 4, B = 5)

4. **Salve o arquivo**

5. **Inicie o servidor:**
```bash
npm run dev
```

## ⚠️ Erros Comuns

- **"MONGODB_URI is required"**: O arquivo `.env` não existe ou a variável não está definida
- **"JWT_SECRET must be at least 32 characters"**: O JWT_SECRET tem menos de 32 caracteres
- **Arquivo não encontrado**: Certifique-se de que o arquivo está na pasta `backend/` e se chama exatamente `.env` (com o ponto no início)

## 📝 Nota

O arquivo `env.ts` é apenas para **validação** das variáveis. As variáveis reais devem estar no arquivo `.env`.

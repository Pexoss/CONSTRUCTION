# Guia de Login - Sistema de Gestão de Aluguel

## 📋 Informações para Login

Com base no retorno do cadastro da empresa, você precisa usar:

### Dados do Cadastro:
- **Email do usuário**: `admin@teste.com` (não o email da empresa!)
- **Senha**: A senha que você usou no cadastro (ex: `senha123`)
- **Company ID**: `695edffbe992ed314f612ed8`

## 🔐 Endpoint de Login

### Via Postman/API:

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@teste.com",
  "password": "senha123",
  "companyId": "695edffbe992ed314f612ed8"
}
```

### Via PowerShell (Invoke-RestMethod):

```powershell
$body = @{
    email = "admin@teste.com"
    password = "senha123"
    companyId = "695edffbe992ed314f612ed8"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

### Via cURL:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@teste.com",
    "password": "senha123",
    "companyId": "695edffbe992ed314f612ed8"
  }'
```

## ✅ Resposta Esperada

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "695edffbe992ed314f612eda",
      "name": "Admin",
      "email": "admin@teste.com",
      "role": "superadmin",
      "companyId": "695edffbe992ed314f612ed8"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

## 🔑 Usar os Tokens

### Access Token (para requisições autenticadas):

```http
GET http://localhost:3000/api/auth/me
Authorization: Bearer eyJhbGc... (seu accessToken)
X-Company-Id: 695edffbe992ed314f612ed8
```

### Refresh Token (para renovar access token):

```http
POST http://localhost:3000/api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..." (seu refreshToken)
}
```

## 💡 Notas Importantes

1. **Email**: Use o email do **usuário** (`userEmail`), não o email da empresa
2. **Password**: A senha que você usou no cadastro da empresa
3. **Company ID**: O `_id` da empresa retornado no cadastro
4. **Access Token**: Válido por 15 minutos (configurável)
5. **Refresh Token**: Válido por 7 dias (configurável)

## 🌐 Via Frontend

Se estiver usando o frontend, acesse:
- URL: `http://localhost:3001/login`
- Preencha:
  - **ID da Empresa**: `695edffbe992ed314f612ed8`
  - **Email**: `admin@teste.com`
  - **Senha**: `senha123`

# Como Verificar e Criar o Banco de Dados MongoDB

## ❓ Por que o banco não foi criado?

No MongoDB, **os bancos de dados só são criados quando você escreve dados pela primeira vez**. Isso significa:

- O banco `construction-rental` só será criado quando:
  1. O servidor backend conectar com sucesso
  2. E uma operação de escrita (CREATE/INSERT) for executada

## ✅ Verificar se o MongoDB está rodando

### Windows (PowerShell):
```powershell
# Verificar serviço
Get-Service -Name MongoDB

# Ver status
net start | findstr MongoDB
```

### Verificar conectividade:
```powershell
# Testar conexão (se mongosh estiver instalado)
mongosh mongodb://localhost:27017
```

## 🔍 Verificar se o banco foi criado

### Opção 1: Usando mongosh (MongoDB Shell)
```bash
# Conectar ao MongoDB
mongosh

# Listar todos os bancos
show dbs

# Usar o banco (criará se não existir + houver escrita)
use construction-rental

# Ver collections
show collections

# Ver documentos em uma collection
db.companies.find()
db.users.find()
```

### Opção 2: Usando MongoDB Compass (GUI)
1. Abra o MongoDB Compass
2. Conecte em: `mongodb://localhost:27017`
3. Veja se o banco `construction-rental` aparece na lista

## 🚀 Forçar criação do banco

O banco será criado automaticamente quando você:

1. **Iniciar o servidor backend** (se conectou com sucesso)
2. **Registrar uma empresa** pela primeira vez:
   ```bash
   POST http://localhost:3000/api/auth/register
   ```

### Teste rápido - Criar uma empresa via API:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Empresa Teste",
    "cnpj": "12345678000190",
    "email": "teste@empresa.com",
    "userName": "Admin",
    "userEmail": "admin@teste.com",
    "password": "senha123"
  }'
```

## ⚠️ Problemas Comuns

### 1. MongoDB não está rodando
**Solução**: Inicie o serviço
```powershell
# Windows
net start MongoDB
```

### 2. Porta errada
**Verificar**: MongoDB usa porta 27017 por padrão
```powershell
netstat -an | findstr 27017
```

### 3. Servidor backend não conectou
**Verificar logs do backend**:
- Deve aparecer: `✅ MongoDB connected successfully`
- Se aparecer erro, verifique a URI no `.env`

### 4. Banco existe mas está vazio
**Normal**: O banco existe, mas sem collections ainda. Collections são criadas no primeiro insert.

## 📝 Verificar Status Atual

Execute estes comandos para verificar:

```powershell
# 1. Verificar se MongoDB está rodando
Get-Service MongoDB

# 2. Verificar se backend está rodando
# (deve estar na porta 3000)

# 3. Testar health check
curl http://localhost:3000/health

# 4. Listar bancos (se mongosh disponível)
mongosh --eval "show dbs"
```

## ✅ Confirmação

Após registrar uma empresa, o banco será criado com:
- Database: `construction-rental`
- Collections: `companies`, `users`

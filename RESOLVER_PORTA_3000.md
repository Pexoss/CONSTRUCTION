# Como Resolver Erro "Porta 3000 já em uso"

## ❌ Erro
```
Error: listen EADDRINUSE: address already in use :::3000
```

## ✅ Soluções

### Opção 1: Encerrar o processo que está usando a porta (Recomendado)

#### Windows PowerShell:
```powershell
# 1. Identificar o processo usando a porta 3000
netstat -ano | findstr :3000

# 2. Ver o nome do processo
Get-Process -Id <PID> | Select-Object ProcessName

# 3. Encerrar o processo
taskkill /PID <PID> /F

# Ou tudo em um comando:
$port = 3000
$process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($process) {
    Stop-Process -Id $process.OwningProcess -Force
    Write-Host "Processo na porta $port encerrado"
}
```

#### Alternativa Rápida:
```powershell
# Encerrar processo na porta 3000 diretamente
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force
```

### Opção 2: Usar outra porta

Edite o arquivo `.env` do backend:
```env
PORT=3001
```

Ou defina na linha de comando:
```powershell
$env:PORT=3001; npm run dev
```

### Opção 3: Verificar se há outro servidor rodando

Se você tem outra instância do backend rodando:
1. Procure por outro terminal/console rodando `npm run dev`
2. Pressione `Ctrl+C` para parar
3. Ou encerre o processo pelo Task Manager

## 🔍 Verificar Processos Node

```powershell
# Ver todos os processos Node
Get-Process node -ErrorAction SilentlyContinue

# Ver processos usando a porta 3000
netstat -ano | findstr :3000
```

## 🚀 Comandos Rápidos

### Parar TODOS os processos Node:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Parar processo específico na porta 3000:
```powershell
$port = 3000
$connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connection) {
    Stop-Process -Id $connection.OwningProcess -Force
}
```

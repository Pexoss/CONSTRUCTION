# Comandos Git - Adicionar Arquivos

## Passo a Passo para Adicionar Todos os Arquivos

### 1. Verificar o status atual
```bash
git status
```

### 2. Adicionar TODOS os arquivos (incluindo novos e modificados)
```bash
git add .
```

Ou, se quiser adicionar arquivos específicos:
```bash
git add backend/
git add frontend/
git add .gitignore
git add README.md
git add SETUP.md
```

### 3. Verificar o que será commitado
```bash
git status
```

### 4. Fazer o commit
```bash
git commit -m "Initial commit: Sistema de Gestão de Aluguel - Fase 1: Fundação e Autenticação"
```

### 5. (Opcional) Adicionar remote e fazer push
Se você já tem um repositório remoto configurado:
```bash
git remote add origin <URL_DO_REPOSITORIO>
git branch -M main
git push -u origin main
```

## ⚠️ Importante

O arquivo `.gitignore` já está configurado para **não adicionar**:
- `node_modules/` (dependências)
- `.env` (variáveis de ambiente)
- `dist/` e `build/` (arquivos compilados)
- Arquivos temporários e logs

Isso significa que quando você executar `git add .`, esses arquivos **não serão adicionados**, o que é o comportamento correto!

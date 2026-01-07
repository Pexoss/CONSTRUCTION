# Como Configurar Git Remote

## ❌ Erro Atual
```
fatal: 'origin' does not appear to be a git repository
```

## ✅ Solução

### Opção 1: Criar Repositório no GitHub/GitLab e Conectar

#### Passo 1: Criar Repositório no GitHub
1. Acesse https://github.com (ou GitLab/Bitbucket)
2. Clique em "New repository"
3. Dê um nome (ex: `construction-rental-system`)
4. **NÃO** inicialize com README, .gitignore ou license
5. Clique em "Create repository"

#### Passo 2: Adicionar Remote e Fazer Push

**Para HTTPS:**
```bash
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git branch -M main
git push -u origin main
```

**Para SSH:**
```bash
git remote add origin git@github.com:SEU_USUARIO/NOME_DO_REPOSITORIO.git
git branch -M main
git push -u origin main
```

### Opção 2: Trabalhar Apenas Localmente (Sem Remote)

Se você não precisa de um repositório remoto agora, pode trabalhar apenas localmente:

```bash
# Fazer commit local
git commit -m "Initial commit: Sistema de Gestão de Aluguel - Fase 1"

# Ver histórico
git log

# Trabalhar normalmente, fazer commits, etc.
# Quando quiser adicionar remote depois, use a Opção 1
```

### Verificar Remote Configurado

```bash
# Listar remotes
git remote -v

# Ver detalhes do remote (só funciona se estiver configurado)
git remote show origin
```

## 🔍 Comandos Úteis

```bash
# Remover remote (se adicionou errado)
git remote remove origin

# Alterar URL do remote
git remote set-url origin NOVA_URL

# Ver configuração atual
git remote -v
```

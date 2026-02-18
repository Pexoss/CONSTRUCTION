# 🔍 Investigação: Logout Frequente do Dashboard

## Problemas Identificados

### 1. ⏱️ **Access Token com Expiração MUITO Curta (15 minutos)**
**Arquivo:** [backend/.env](backend/.env)
```
JWT_ACCESS_EXPIRES_IN=15m  ← PROBLEMA AQUI
JWT_REFRESH_EXPIRES_IN=7d
```

**Impacto:** A cada 15 minutos, o access token expira automaticamente. Se você testa a plataforma por mais tempo, o token vence e precisa fazer refresh. Se houver qualquer erro no refresh, você é deslogado.

**Recomendação:** Aumentar para **1-2 horas** no desenvolvimento:
```
JWT_ACCESS_EXPIRES_IN=2h  ← Para desenvolvimento
```

---

### 2. 🔄 **Possível Problema no Interceptador de Refresh**
**Arquivo:** [frontend/src/config/api.ts](frontend/src/config/api.ts)

**Problema potencial:**
- Quando faz refresh, usa `axios.post()` diretamente, sem os interceptadores do `api` - isso é correto
- Se o refresh FALHA, logo você é deslogado (`window.location.href = '/login'`)
- Se houver qualquer erro na resposta do backend (5xx, timeout, etc), automaticamente faz logout

**Verificar:**
- O endpoint `/auth/refresh` está retornando status 200?
- Está retornando no formato esperado: `{ success: true, data: { accessToken: '...' } }`?

---

### 3. 🎯 **Query Validation Agressiva**
**Arquivo:** [frontend/src/hooks/useAuth.ts](frontend/src/hooks/useAuth.ts)

```typescript
const { data: currentUser, isLoading: isLoadingUser, error: userError } = useQuery({
  queryKey: ['me'],
  queryFn: () => authService.getMe(),
  enabled: isAuthenticated && !!localStorage.getItem('accessToken'),
  retry: false,  // ← Sem retry
});

// Se qualquer erro na query acima:
useEffect(() => {
  if (userError) {
    logout();  // ← LOGOUT AUTOMÁTICO
  }
}, [userError, logout]);
```

**Problema:** Se há um erro na validação do usuário (network timeout, servidor lento, etc), desliga imediatamente sem tentar novamente.

---

## Checklist de Diagnóstico

- [ ] **Verificar logs do backend** - O endpoint `/auth/me` está falhando?
- [ ] **Verificar logs do browser** - Console de erros mostra algo?
- [ ] **Testar refresh manualmente** - POST para `/api/auth/refresh` com um refreshToken válido funciona?
- [ ] **Verificar tokens nos localStorage** - Estão sendo armazenados corretamente?
- [ ] **Medir tempo de teste** - Você testou por mais de 15 minutos?

---

## Soluções Recomendadas

### Solução 1: Aumentar Expiração do Access Token (RÁPIDA)
Alterar o `.env` do backend:
```env
JWT_ACCESS_EXPIRES_IN=2h
# Depois fazer: npm run dev
```

### Solução 2: Melhorar a Lógica de Refresh
Adicionar retry e melhor tratamento de erro (veja mais abaixo).

### Solução 3: Debugar o Endpoint de Refresh
Adicionar logs no backend para saber se o refresh está falhando.

---

## Próximos Passos

1. **Aumentar o tempo de expiração** no `.env` para testar
2. **Verificar logs do browser** (abrir DevTools F12 → Console → verificar erros)
3. **Verificar resposta do `/auth/refresh`** (Network tab → Ver se 401/500/etc)
4. **Adicionar retry logic** no interceptador

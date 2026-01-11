# Módulo 2: Inventário/Estoque - Implementação Completa

## ✅ Funcionalidades Implementadas

### 1. CRUD de Itens (Materiais/Equipamentos)
- ✅ Criar item
- ✅ Listar itens (com filtros e paginação)
- ✅ Obter item por ID
- ✅ Atualizar item
- ✅ Deletar item (soft delete)

### 2. Categorização Hierárquica
- ✅ CRUD de Categorias
- ✅ CRUD de Subcategorias
- ✅ Relação Categoria > Subcategoria

### 3. Fotos Múltiplas
- ✅ Campo `photos` (array de URLs)
- ✅ Validação de URLs

### 4. Rastreamento de Quantidades
- ✅ Total
- ✅ Disponível
- ✅ Alugada
- ✅ Em manutenção
- ✅ Danificada
- ✅ Cálculo automático de disponível

### 5. Códigos de Identificação
- ✅ SKU (obrigatório, único por empresa)
- ✅ Barcode (opcional, único quando presente)
- ✅ Custom ID (ex: "betoneira 13") - opcional

### 6. Alertas de Estoque Baixo
- ✅ Campo `lowStockThreshold`
- ✅ Endpoint `/api/inventory/items/low-stock`
- ✅ Filtro `?lowStock=true` na listagem

### 7. Histórico de Movimentações
- ✅ Registro automático de todas as movimentações
- ✅ Tipos: `in`, `out`, `rent`, `return`, `maintenance_start`, `maintenance_end`, `damage`, `repair`, `adjustment`
- ✅ Endpoint para visualizar histórico por item
- ✅ Filtros por tipo e período

### 8. Controle de Depreciação
- ✅ Valor inicial
- ✅ Valor atual
- ✅ Taxa de depreciação (% anual)
- ✅ Data de compra
- ✅ Última depreciação calculada
- ✅ Endpoint para calcular depreciação

### 9. Preços e Depósito
- ✅ Taxa diária (obrigatória)
- ✅ Taxa semanal (opcional)
- ✅ Taxa mensal (opcional)
- ✅ Valor de depósito (opcional)

### 10. Outras Funcionalidades
- ✅ Localização do item
- ✅ Especificações customizadas (objeto flexível)
- ✅ Ajuste manual de quantidade
- ✅ Paginação em todas as listagens
- ✅ Busca por nome, SKU, barcode, customId, descrição

## 📁 Estrutura de Arquivos Criados

```
backend/src/modules/inventory/
├── item.model.ts           # Schema MongoDB do Item
├── item.types.ts           # Interfaces TypeScript
├── item.service.ts         # Lógica de negócio
├── item.controller.ts      # Handlers HTTP
├── item.routes.ts          # Rotas da API
├── item.validator.ts       # Schemas Zod para validação
├── itemMovement.model.ts   # Schema de histórico de movimentações
├── category.model.ts       # Schema de Categorias
└── subcategory.model.ts    # Schema de Subcategorias
```

## 🔌 Endpoints da API

### Items (Itens)

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/api/inventory/items` | Criar item | ✅ |
| GET | `/api/inventory/items` | Listar itens (com filtros) | ✅ |
| GET | `/api/inventory/items/low-stock` | Itens com estoque baixo | ✅ |
| GET | `/api/inventory/items/:id` | Obter item por ID | ✅ |
| PUT | `/api/inventory/items/:id` | Atualizar item | ✅ |
| DELETE | `/api/inventory/items/:id` | Deletar item (soft) | ✅ |
| POST | `/api/inventory/items/:id/adjust-quantity` | Ajustar quantidade | ✅ |
| GET | `/api/inventory/items/:id/movements` | Histórico de movimentações | ✅ |
| POST | `/api/inventory/items/:id/calculate-depreciation` | Calcular depreciação | ✅ |

### Categories (Categorias)

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/api/inventory/categories` | Criar categoria | ✅ |
| GET | `/api/inventory/categories` | Listar categorias | ✅ |
| PUT | `/api/inventory/categories/:id` | Atualizar categoria | ✅ |
| DELETE | `/api/inventory/categories/:id` | Deletar categoria (soft) | ✅ |

### Subcategories (Subcategorias)

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/api/inventory/subcategories` | Criar subcategoria | ✅ |
| GET | `/api/inventory/subcategories` | Listar subcategorias | ✅ |
| PUT | `/api/inventory/subcategories/:id` | Atualizar subcategoria | ✅ |
| DELETE | `/api/inventory/subcategories/:id` | Deletar subcategoria (soft) | ✅ |

## 📋 Exemplos de Uso

### Criar Item

```http
POST /api/inventory/items
Authorization: Bearer <token>
X-Company-Id: <company_id>
Content-Type: application/json

{
  "name": "Betoneira 400L",
  "description": "Betoneira elétrica 400 litros",
  "category": "Equipamentos",
  "subcategory": "Betoneiras",
  "sku": "BET-400-001",
  "customId": "betoneira-13",
  "barcode": "7891234567890",
  "photos": ["https://example.com/betoneira.jpg"],
  "quantity": {
    "total": 5,
    "available": 5,
    "rented": 0,
    "maintenance": 0,
    "damaged": 0
  },
  "pricing": {
    "dailyRate": 150.00,
    "weeklyRate": 800.00,
    "monthlyRate": 3000.00,
    "depositAmount": 5000.00
  },
  "location": "Galpão A - Prateleira 3",
  "lowStockThreshold": 2,
  "depreciation": {
    "initialValue": 8000.00,
    "depreciationRate": 10,
    "purchaseDate": "2024-01-01T00:00:00Z"
  }
}
```

### Listar Itens com Filtros

```http
GET /api/inventory/items?category=Equipamentos&lowStock=true&page=1&limit=20&search=betoneira
Authorization: Bearer <token>
X-Company-Id: <company_id>
```

**Query Parameters:**
- `category` - Filtrar por categoria
- `subcategory` - Filtrar por subcategoria
- `search` - Buscar em nome, SKU, barcode, customId, descrição
- `isActive` - true/false para filtrar por status
- `lowStock` - true para apenas itens com estoque baixo
- `page` - Número da página
- `limit` - Itens por página

### Ajustar Quantidade

```http
POST /api/inventory/items/:id/adjust-quantity
Authorization: Bearer <token>
X-Company-Id: <company_id>
Content-Type: application/json

{
  "type": "in",
  "quantity": 3,
  "notes": "Nova compra de betoneiras"
}
```

**Tipos de ajuste:**
- `in` - Entrada (aumenta total e disponível)
- `out` - Saída (diminui total e disponível)
- `adjustment` - Ajuste manual (pode ser positivo ou negativo)
- `damage` - Danificar (move de disponível para danificado)
- `repair` - Reparar (move de danificado para disponível)

### Obter Histórico de Movimentações

```http
GET /api/inventory/items/:id/movements?type=in&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
X-Company-Id: <company_id>
```

### Calcular Depreciação

```http
POST /api/inventory/items/:id/calculate-depreciation
Authorization: Bearer <token>
X-Company-Id: <company_id>
```

## 🔐 Autenticação

Todos os endpoints requerem:
- Header `Authorization: Bearer <access_token>`
- Header `X-Company-Id: <company_id>`

## 📊 Schema MongoDB

### Item
- Company isolation (companyId indexado)
- SKU único por empresa
- Barcode único quando presente
- Custom ID único quando presente
- Índices para performance

### ItemMovement
- Registro completo de todas as movimentações
- População de item e usuário
- Indexação por data e tipo

### Category/Subcategory
- Isolamento por empresa
- Nome único por empresa/categoria
- Soft delete

## ✅ Checklist de Implementação

- [x] Schema MongoDB completo
- [x] Types TypeScript
- [x] Validadores Zod
- [x] Service com toda lógica de negócio
- [x] Controller com todos os endpoints
- [x] Rotas configuradas
- [x] Integrado no servidor principal
- [x] Histórico de movimentações
- [x] Alertas de estoque baixo
- [x] Controle de depreciação
- [x] Paginação e filtros
- [x] Validações completas
- [x] TypeScript sem erros

## 🚀 Próximos Passos

O módulo está completo e pronto para uso. Quando integrar com aluguéis, o histórico será atualizado automaticamente.

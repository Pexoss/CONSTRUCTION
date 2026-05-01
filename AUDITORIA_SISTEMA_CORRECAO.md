# Auditoria Do Sistema E Plano De Correcao

Data: 2026-04-30

## Resumo Executivo

Esta auditoria revisou os fluxos de aluguel, estoque, financeiro, cobrancas, faturas, clientes, relatorios, PDFs e contratos entre frontend e backend. A analise encontrou riscos de alta prioridade em quatro areas: isolamento multiempresa, saldo financeiro, estoque reservado e calculos de fechamento/cobranca.

O sistema tem regras de negocio duplicadas entre tela e backend, especialmente para calculo de aluguel, datas, caução, descontos e status financeiro. Isso aumenta a chance de valores diferentes aparecerem no contrato, fechamento, cobranca, fatura, relatorio e PDF.

## Severidade Por Area

| Area | Severidade | Risco principal | Acao recomendada |
| --- | --- | --- | --- |
| Multiempresa | Critica | Acesso cruzado via `X-Company-Id` | Corrigir tenant middleware antes de novas releases |
| Financeiro | Critica | Fechamento pago pode reabrir saldo | Corrigir hook de `Billing` e auditar saldos |
| Estoque | Critica | `reserved` usado pelo service mas ausente no schema | Alinhar schema/types/migracao de estoque |
| Fechamento de item | Critica | Periodo final recalculado depois de encerrar `lastBillingDate` | Reordenar calculo e centralizar regra |
| Cobrancas | Alta | Pagamento rateado igualmente entre fechamentos | Distribuir por saldo aberto real |
| Faturas | Alta | Totais podem ignorar saldo/desconto/taxa dos fechamentos | Gerar fatura pelo valor governante |
| Datas | Media/Alta | Deslocamento de dia e contratos API inconsistentes | Padronizar date-only vs datetime |
| CPF/CNPJ | Media/Alta | Validacao e duplicidade por string bruta | Normalizar documento e validar CPF/CNPJ |
| Relatorios | Media | Receita, recebido, pendente e patrimonio misturados | Recalcular KPIs por fonte governante |

## Achados Detalhados

### 1. Isolamento Multiempresa

Arquivo: `backend/src/shared/middleware/tenant.middleware.ts`

Evidencia:

```ts
let companyId = req.headers['x-company-id'] as string;

if (!companyId && req.user?.companyId) {
  companyId = req.user.companyId.toString();
}
```

Risco de negocio: um usuario autenticado pode forcar outro `companyId` via header se souber o identificador de outra empresa. Isso afeta confidencialidade e integridade dos dados.

Plano de acao:

- Para usuarios comuns, sempre usar `req.user.companyId`.
- Permitir `X-Company-Id` apenas para `superadmin` ou papel equivalente.
- Registrar auditoria quando houver override administrativo.
- Adicionar teste garantindo que usuario comum nao acessa empresa diferente.

### 2. Fechamentos Pagos Podem Reabrir Saldo

Arquivo: `backend/src/modules/billings/billing.model.ts`

Evidencia:

```ts
if ((this as any).outstandingAmount === 0 || (this as any).outstandingAmount === undefined) {
  (this as any).outstandingAmount = Math.max(0, (this as any).calculation?.total || 0);
}
```

Risco de negocio: quando uma baixa zera o saldo, um `save()` posterior pode redefinir o saldo para o total calculado. Isso pode transformar fechamento pago em pendente novamente.

Plano de acao:

- Alterar o hook para preencher `outstandingAmount` apenas quando `undefined` ou `null`.
- Criar auditoria para `status: "paid"` com `outstandingAmount > 0`.
- Corrigir dados inconsistentes antes de liberar novas baixas.

### 3. Campo `reserved` Inconsistente No Estoque

Arquivos:

- `backend/src/modules/inventory/item.model.ts`
- `backend/src/modules/inventory/item.types.ts`
- `backend/src/modules/inventory/item.validator.ts`
- `backend/src/modules/rentals/rental.service.ts`

Evidencia: `item.types.ts` e `item.validator.ts` possuem `quantity.reserved`, mas `item.model.ts` nao persiste esse campo. O service de aluguel usa `inventoryItem.quantity.reserved` em validacoes e movimentacoes.

Risco de negocio: reservas podem nao persistir corretamente, gerar `undefined`, permitir aluguel acima do estoque ou bloquear devolucoes.

Plano de acao:

- Adicionar `reserved` ao schema de `Item.quantity` com default `0`.
- Atualizar movimentos para incluir `reserved` em `previousQuantity` e `newQuantity`.
- Criar script de auditoria para recalcular `available + reserved + rented + maintenance + damaged`.
- Decidir regra de disponibilidade: `available = total - reserved - rented - maintenance - damaged`.

### 4. Fechamento Final De Item Pode Recalcular Periodo Errado

Arquivo: `backend/src/modules/rentals/rental.service.ts`

Evidencia: `closeRentalItem` cria billing final, depois seta `targetItem.lastBillingDate = periodEnd`, e em seguida recalcula subtotal usando:

```ts
const startDate = targetItem.lastBillingDate
  ? this.addDays(targetItem.lastBillingDate, 1)
  : targetItem.pickupScheduled || rental.dates.pickupScheduled;
```

Risco de negocio: o subtotal do item pode ser recalculado a partir do dia seguinte a devolucao, resultando em periodo negativo, 1 dia minimo indevido, subcobranca ou supercobranca.

Plano de acao:

- Calcular tudo que depende do periodo antes de atualizar `lastBillingDate`.
- Reutilizar o mesmo helper de calculo usado para o billing final.
- Criar testes com devolucao parcial em diaria, semanal, quinzenal e mensal.

### 5. Baixa De Cobranca Rateada Igualmente

Arquivo: `backend/src/modules/charges/charge.service.ts`

Evidencia:

```ts
const each = net / Math.max(1, charge.billingIds.length);
for (const billingId of charge.billingIds) {
  await financialService.appendBillingPayment(billingId, { amount: each, ... });
}
```

Risco de negocio: uma cobranca com varios fechamentos pode baixar valores errados em cada fechamento. Um fechamento pequeno pode receber pagamento maior que seu saldo e outro continuar aberto.

Plano de acao:

- Validar `amount + discount <= charge.outstandingAmount`.
- Buscar fechamentos vinculados e distribuir por `outstandingAmount`, em ordem deterministica.
- Gravar desconto separadamente, sem misturar com dinheiro recebido.
- Rejeitar baixa em cobranca paga/cancelada e idempotencia para repeticoes.

### 6. Caução Misturada Com Receita

Arquivos:

- `frontend/src/modules/rentals/CreateRentalPage.tsx`
- `backend/src/modules/rentals/rental.service.ts`
- `backend/src/modules/billings/billing.service.ts`
- `backend/src/modules/reports/report.service.ts`

Risco de negocio: a criacao do aluguel apresenta caução separada do total, mas fechamentos somam caução no total. Isso pode inflar receita e gerar divergencia entre contrato, cobranca e relatorio.

Decisao recomendada:

- Caução nao deve ser receita de locacao por padrao.
- Modelar caução como movimento separado: `depositExpected`, `depositReceived`, `depositReturned`, `depositRetained`, `depositAppliedToDebt`.
- Exibir na tela: `Total da locacao`, `Caução`, `Total a receber hoje` quando aplicavel.

### 7. Contrato De Fatura E Tela Financeira Divergentes

Arquivos:

- `frontend/src/modules/financial/FinancialCenterPage.tsx`
- `backend/src/modules/invoices/invoice.validator.ts`

Evidencia: frontend envia `dueDate` como `YYYY-MM-DD`; backend exige `z.string().datetime().or(z.date())`.

Risco de negocio: gerar fatura a partir do financeiro pode falhar quando o usuario informa vencimento.

Plano de acao:

- Se for vencimento de calendario, backend deve aceitar `YYYY-MM-DD` com `z.coerce.date()` ou schema dedicado.
- Frontend deve converter para contrato definido apenas se for datetime.
- Documentar campos date-only e datetime.

### 8. Status `ready_to_close` Desalinhado

Arquivos:

- `backend/src/modules/rentals/rental.model.ts`
- `backend/src/modules/rentals/rental.types.ts`
- `backend/src/modules/rentals/rental.validator.ts`
- `frontend/src/types/rental.types.ts`

Risco de negocio: tela e backend podem discordar sobre transicoes validas. Um aluguel pode ficar em estado visivel na UI, mas rejeitado em endpoints de atualizacao.

Plano de acao:

- Decidir se `ready_to_close` e status publico/editavel ou apenas interno.
- Alinhar model, validators, types, notificacoes e telas.
- Criar teste de transicao: ativo -> ready_to_close -> completed.

### 9. CPF/CNPJ E Duplicidade

Arquivos:

- `backend/src/modules/customers/customer.model.ts`
- `backend/src/modules/customers/customer.validator.ts`
- `frontend/src/modules/customers/EditCustomerPage.tsx`
- `frontend/src/modules/rentals/CreateRentalPage.tsx`

Risco de negocio: documentos com pontuacao diferente podem duplicar cadastro. O fluxo de aluguel recentemente passou a exigir CPF, mas clientes pessoa juridica podem precisar CNPJ.

Plano de acao:

- Criar util compartilhado de normalizacao por digitos.
- Validar CPF e CNPJ conforme tipo de cliente.
- Salvar `cpfCnpj` sempre normalizado.
- Criar indice unico parcial por `companyId + cpfCnpj` quando documento existir.

### 10. Datas E Fuso Horario

Arquivos observados:

- `frontend/src/utils/formatters.ts`
- `frontend/src/modules/rentals/CreateRentalPage.tsx`
- `frontend/src/modules/rentals/RentalDetailPage.tsx`
- `frontend/src/modules/financial/FinancialCenterPage.tsx`
- `backend/src/modules/rentals/rental.service.ts`
- `backend/src/modules/billings/billing.service.ts`
- `backend/src/modules/reports/report.service.ts`

Risco de negocio: datas podem aparecer ou fechar um dia antes/depois, principalmente quando uma data de calendario e transformada em `Date` UTC.

Plano de acao:

- Campos de calendario: trafegar `YYYY-MM-DD`.
- Campos com horario real: trafegar ISO datetime com timezone.
- Backend deve parsear datas de negocio explicitamente como `America/Sao_Paulo` ou como data local sem horario.
- Frontend deve usar `formatDateNoTimezoneShift` apenas para date-only e `toLocaleString` para timestamps reais.

## Regra Financeira Canonica Recomendada

### Tipos De Valor

- `equipmentSubtotal`: valor de locacao dos itens.
- `servicesSubtotal`: servicos adicionais.
- `discount`: desconto comercial.
- `lateFee`: multa/taxa.
- `deposit`: caução, separada de receita.
- `rentalTotal`: `equipmentSubtotal + servicesSubtotal - discount + lateFee`.
- `amountDueNow`: valor financeiro a receber no momento, podendo incluir caução quando ela for cobrada.
- `outstandingAmount`: saldo aberto governante de um fechamento/cobranca/fatura.

### Calculo De Periodo

Regra recomendada para padronizar:

- Diaria: cobrar por dias corridos, minimo 1 dia.
- Semanal/quinzenal/mensal: cobrar periodos completos e dias extras por diaria configurada, quando houver diaria.
- Sem diaria configurada, dias extras devem seguir politica explicita: rejeitar calculo ou cobrar periodo cheio. A recomendacao e rejeitar ate configurar diaria, para evitar valor implicito.
- Devolucao parcial deve gerar billing apenas do periodo ainda nao cobrado.

### Fonte Governante

- Antes de faturar: `Billing.outstandingAmount` governa o saldo.
- Cobranca: soma dos saldos dos billings vinculados.
- Fatura: deve copiar saldos governantes dos billings/cobrancas, nao recalcular do zero por linhas antigas.
- Relatorio financeiro: usar pagamentos, saldos e status governantes, nao `rental.pricing.total` isoladamente.

### Decisoes De Negocio Recomendadas

| Tema | Decisao recomendada | Motivo |
| --- | --- | --- |
| Caução | Nao compor receita de locacao | Caução pode ser devolvida ou abatida; tratar como receita infla resultado |
| Servicos | Compor total de locacao quando prestados | Frete, instalacao e limpeza sao cobrancas do contrato |
| Desconto | Abater antes de taxa/multa apenas se for desconto comercial | Desconto operacional precisa motivo e usuario |
| Multa/taxa | Somar depois do subtotal e desconto | Evita desconto automatico sobre multa, salvo regra explicita |
| Dias extras | Cobrar por diaria configurada | Mantem proporcionalidade e previsibilidade |
| Periodo minimo | Sempre 1 periodo/dia cobravel | Evita aluguel gratis por devolucao no mesmo dia |
| Devolucao parcial | Gerar billing por item/linha devolvida | Evita cobrar item ainda em campo como devolvido |
| Fatura | Usar saldo governante, nao recalculo de contrato | Fatura deve representar divida aprovada |
| Relatorio | Separar previsto, faturado, recebido e pendente | Evita KPI financeiro ambíguo |

### Formula Recomendada

Para cada linha de item:

```text
lineBase = fullPeriods * configuredPeriodRate + extraDays * dailyRate
lineSubtotal = lineBase * quantity
```

Para o fechamento:

```text
equipmentSubtotal = sum(lineSubtotal)
servicesSubtotal = sum(service.subtotal)
subtotal = equipmentSubtotal + servicesSubtotal
rentalTotal = max(0, subtotal - discount + lateFee)
outstandingAmount = rentalTotal - paidAmount - discountSettlement
```

Para caução:

```text
depositBalance = depositReceived - depositReturned - depositAppliedToDebt - depositRetained
```

Campos que nao devem ser misturados:

- `rentalTotal` nao deve incluir caução por padrao.
- `paidAmount` deve representar dinheiro recebido.
- `discount` ou `discountSettlement` nao deve ser contado como dinheiro recebido.
- `outstandingAmount` deve ser o saldo financeiro governante.

### Contrato De Datas

| Tipo de campo | Formato | Exemplos | Uso |
| --- | --- | --- | --- |
| Data de calendario | `YYYY-MM-DD` | vencimento, filtros, relatorios por dia | Nao converter com timezone na tela |
| Timestamp operacional | ISO datetime | retirada com horario, devolucao real, pagamento | Exibir com data e hora local |
| Periodo de billing | ISO datetime normalizado ou date-only canonico | inicio/fim do fechamento | Calcular com helper unico |

Regra: uma funcao unica deve transformar entrada do usuario em periodo de negocio. Nenhum modulo deve fazer `new Date("YYYY-MM-DD")` diretamente para regra financeira.

## Mapa De Divergencias De Contrato

| Contrato | Frontend | Backend | Risco | Acao |
| --- | --- | --- | --- | --- |
| Rental status | Inclui `ready_to_close` | Validator de status nao aceita em todos endpoints | Rejeicao de acao | Alinhar enums |
| Invoice `dueDate` | `YYYY-MM-DD` | datetime | Falha ao gerar fatura | Definir date-only ou datetime |
| Customer address `type` | Opcional | Model exige | Falha ao salvar endereco | Tornar obrigatorio ou default |
| Item `quantity.reserved` | Type/validator possuem | Model nao possui | Estoque inconsistente | Adicionar ao schema e migrar |
| CPF/CNPJ | Livre em edicao | Duplicidade por string | Duplicidade/invalidos | Normalizar e validar |
| Maintenance status | Frontend incompleto | Backend aceita mais estados/campos | UI perde dados | Alinhar tipos |
| Billing totals | Tela/backend recalculam | Billing tem saldo governante | Divergencia financeira | Usar fonte unica |

### Backlog De Alinhamento De Contratos

1. `RentalStatus`
   - Frontend: `frontend/src/types/rental.types.ts`
   - Backend: `backend/src/modules/rentals/rental.types.ts`, `backend/src/modules/rentals/rental.model.ts`, `backend/src/modules/rentals/rental.validator.ts`
   - Prioridade: alta
   - Acao: definir lista unica e reutilizar no validator.

2. `CreateRentalData`
   - Frontend: `frontend/src/types/rental.types.ts`, `frontend/src/modules/rentals/CreateRentalPage.tsx`
   - Backend: `backend/src/modules/rentals/rental.validator.ts`, `backend/src/modules/rentals/rental.service.ts`
   - Prioridade: alta
   - Acao: aceitar CPF/CNPJ conforme regra de cliente e validar `fulfillmentMethod`.

3. `Invoice dueDate`
   - Frontend: `frontend/src/modules/financial/FinancialCenterPage.tsx`, `frontend/src/modules/invoices/CreateInvoicePage.tsx`
   - Backend: `backend/src/modules/invoices/invoice.validator.ts`
   - Prioridade: alta
   - Acao: padronizar como date-only ou datetime.

4. `Item.quantity`
   - Frontend: `frontend/src/types/inventory.types.ts`, telas de inventario
   - Backend: `backend/src/modules/inventory/item.model.ts`, `backend/src/modules/inventory/item.types.ts`, `backend/src/modules/inventory/item.validator.ts`
   - Prioridade: critica
   - Acao: persistir `reserved` e validar invariantes de quantidade.

5. `CustomerAddress.type`
   - Frontend: `frontend/src/types/customer.types.ts`, telas de clientes e aluguel
   - Backend: `backend/src/modules/customers/customer.model.ts`, `backend/src/modules/customers/customer.validator.ts`
   - Prioridade: media
   - Acao: tornar obrigatorio na UI/API ou definir default seguro.

6. `BillingPayment`
   - Frontend: `frontend/src/modules/financial/FinancialCenterPage.tsx`
   - Backend: `backend/src/modules/charges/charge.service.ts`, `backend/src/modules/billings/billing.types.ts`
   - Prioridade: alta
   - Acao: separar dinheiro recebido, desconto concedido e origem da baixa.

7. `Maintenance`
   - Frontend: `frontend/src/types/maintenance.types.ts`
   - Backend: modulo `backend/src/modules/maintenance`
   - Prioridade: media
   - Acao: alinhar `cancelled`, `startedDate`, `supplier` e campos exibidos.

8. `Reports`
   - Frontend: `frontend/src/modules/reports/ReportsPage.tsx`
   - Backend: `backend/src/modules/reports/report.service.ts`, `backend/src/modules/reports/report.controller.ts`
   - Prioridade: media
   - Acao: renomear KPIs e usar fonte financeira correta.

### Regra Para Novos Contratos

- Todo endpoint com tela deve ter type frontend e schema backend equivalentes.
- Campos monetarios devem informar se representam previsto, aprovado, recebido ou saldo.
- Campos de data devem declarar `date-only` ou `datetime`.
- Enums devem ser derivados de uma unica lista por dominio.
- Tela nao deve calcular valor final governante quando backend pode retornar preview.

## Criterios De Aceite Da Onda 1

- Usuario comum nao consegue acessar outra empresa via header.
- `Billing` pago permanece com `outstandingAmount = 0` apos qualquer `save()`.
- Itens quantitativos persistem `quantity.reserved` com default `0`.
- Baixa de cobranca rejeita valor maior que saldo.
- Baixa parcial distribui pagamento por saldo aberto real.
- Fechamento de item nao recalcula subtotal com periodo posterior a devolucao.
- Type-check backend e frontend passam.
- Script read-only de auditoria reporta contagens antes/depois das correcoes.

## Plano Tecnico Da Onda 1

### 1. Tenant Middleware

Arquivos:

- `backend/src/shared/middleware/tenant.middleware.ts`
- testes de middleware, se a suite de testes for adicionada ou existente

Implementacao:

- Resolver `companyId` pelo usuario autenticado como regra padrao.
- Aceitar `X-Company-Id` somente para `superadmin`.
- Se usuario comum enviar header divergente, responder `403`.
- Se header for igual ao `req.user.companyId`, aceitar sem risco.

Testes:

- Usuario comum sem header usa sua propria empresa.
- Usuario comum com header diferente recebe `403`.
- Superadmin com header valido acessa empresa indicada.
- Empresa inexistente continua retornando erro.

### 2. Billing Outstanding Amount

Arquivo:

- `backend/src/modules/billings/billing.model.ts`

Implementacao:

- Trocar condicao do hook para inicializar saldo apenas quando `outstandingAmount == null`.
- Preservar explicitamente `0`.
- Garantir que criacoes novas ainda recebam `calculation.total` quando saldo nao vier no payload.

Testes:

- Novo billing sem saldo recebe total.
- Billing com saldo `0` permanece `0` apos `save`.
- Billing parcial preserva saldo parcial.

### 3. Estoque Reservado

Arquivos:

- `backend/src/modules/inventory/item.model.ts`
- `backend/src/modules/inventory/item.types.ts`
- `backend/src/modules/inventory/item.validator.ts`
- `backend/src/modules/inventory/itemMovement.model.ts`
- `backend/src/modules/inventory/itemMovement.types.ts`
- `backend/src/modules/rentals/rental.service.ts`

Implementacao:

- Adicionar `quantity.reserved` ao schema com `required: true`, `default: 0`, `min: 0`.
- Incluir `reserved` nos snapshots de movimentacao.
- Normalizar itens existentes sem `reserved` para `0` via migracao ou hook defensivo temporario.
- Validar soma operacional: `available + reserved + rented + maintenance + damaged <= total`.

Testes:

- Criacao de item quantitativo persiste `reserved = 0`.
- Reserva aumenta `reserved` e reduz `available`.
- Ativacao reduz `reserved` e aumenta `rented`.
- Devolucao reduz `rented` e aumenta `available`.

### 4. Baixa De Cobranca

Arquivos:

- `backend/src/modules/charges/charge.service.ts`
- `backend/src/modules/financial/financial.service.ts`
- `frontend/src/modules/financial/FinancialCenterPage.tsx`

Implementacao:

- Validar `amount >= 0`, `discount >= 0` e `amount + discount <= charge.outstandingAmount`.
- Buscar billings vinculados antes de aplicar baixa.
- Distribuir baixa por saldo em aberto, em ordem por data/numero/id.
- Atualizar cada billing com valor efetivamente alocado.
- Exibir na tela erro claro quando baixa excede saldo.

Testes:

- Baixa total em cobranca com 1 billing quita billing e cobranca.
- Baixa parcial em cobranca com 2 billings abate primeiro saldo ate zerar e segue para o proximo.
- Baixa maior que saldo e rejeitada.
- Desconto maior que saldo e rejeitado.

### 5. Fechamento Final De Item

Arquivo:

- `backend/src/modules/rentals/rental.service.ts`

Implementacao:

- Calcular `periodStart`, `periodEnd`, subtotal e billing final antes de alterar `lastBillingDate`.
- Remover segundo recalculo que usa `lastBillingDate + 1` depois de setar a devolucao.
- Atualizar `targetItem.subtotal` com o mesmo resultado do helper usado pelo billing.
- Evitar `unitPrice * usedDays` quando `unitPrice` ja representa periodo contratado.

Testes:

- Item diario devolvido no mesmo dia cobra minimo 1 diaria.
- Item semanal devolvido apos 8 dias cobra regra canonica definida.
- Item com billing anterior cobra somente periodo remanescente.
- Aluguel muda para `ready_to_close` quando todos itens retornam.

## Plano De Scripts Read-Only

Criar e manter scripts de auditoria que nao alteram dados:

- `backend/scripts/audit-system-consistency.ts`: auditoria consolidada de saldos, estoque, contratos e documentos.
- Filtros por empresa com `--company=<id>`.
- Saida em console com contagens e exemplos limitados.
- Nenhum `save`, `update`, `delete` ou migracao no script.

Auditorias recomendadas:

- `Billing` pago com saldo aberto.
- `Billing` pendente com saldo zero.
- `Charge` com `paidAmount + outstandingAmount` diferente de `total`.
- `Charge` com pagamento maior que saldo original.
- `Item` quantitativo sem `reserved`.
- `Item` com soma de quantidades diferente do total.
- `Rental` em `ready_to_close`.
- `Customer` com CPF/CNPJ invalido, vazio duplicado ou duplicidade por documento normalizado.
- `Invoice` paga com transacoes duplicadas, quando houver relacionamento identificavel.

## Ordem Recomendada De Implementacao

1. Corrigir isolamento multiempresa.
2. Corrigir `Billing.outstandingAmount`.
3. Alinhar estoque reservado.
4. Corrigir baixa de cobranca.
5. Corrigir fechamento final de item.
6. Definir e implementar regra financeira unica.
7. Alinhar contratos API/frontend.
8. Revisar relatorios e PDFs.
9. Rodar auditorias read-only e criar migracoes corretivas separadas, se necessario.


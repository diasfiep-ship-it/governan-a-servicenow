
# Plano: Corrigir Atualização de Chamados Cancelados

## Problema Identificado

Quando um chamado chega com status "Cancelado" no Excel (via Atualizar Base), o sistema:
- Marca corretamente `cancelado: true`
- Define `motivo_cancelamento` e `cancelado_em`
- **MAS NÃO** limpa o `sprint_id` e não atualiza o `status`

Resultado: O chamado RITM0079643 continua aparecendo na Sprint 2 mesmo estando cancelado na planilha.

---

## Solução

Ajustar o objeto `canceladoData` no arquivo `UploadExcel.tsx` para incluir campos que removem o chamado de qualquer sprint e atualizam corretamente o status.

---

## O Que Será Alterado

**Arquivo:** `src/components/UploadExcel.tsx`

**Trecho atual (linhas 659-669):**
```typescript
const canceladoData = {
  cancelado: true,
  motivo_cancelamento: motivoCancelamento || existingChamado?.motivo_cancelamento || 'Cancelado via importação',
  cancelado_em: parseExcelDateTime(row['Encerrado']) || new Date().toISOString(),
  estado: estado || existingChamado?.estado,
  contagem_reabertura: contagemReabertura || existingChamado?.contagem_reabertura || 0,
  aguardando_cliente: aguardandoCliente,
  motivo_pendencia: motivoPendencia || existingChamado?.motivo_pendencia || null,
  comentarios: comentarios || existingChamado?.comentarios || null,
  data_resolvido: dataResolvido || existingChamado?.data_resolvido,
  oculto: false
};
```

**Trecho corrigido:**
```typescript
const canceladoData = {
  cancelado: true,
  status: 'Cancelado',
  status_anterior: existingChamado?.status || null,
  sprint_id: null,
  selecionado_mes: false,
  mes_priorizacao: null,
  motivo_cancelamento: motivoCancelamento || existingChamado?.motivo_cancelamento || 'Cancelado via importação',
  cancelado_em: parseExcelDateTime(row['Encerrado']) || new Date().toISOString(),
  estado: estado || existingChamado?.estado,
  contagem_reabertura: contagemReabertura || existingChamado?.contagem_reabertura || 0,
  aguardando_cliente: aguardandoCliente,
  motivo_pendencia: motivoPendencia || existingChamado?.motivo_pendencia || null,
  comentarios: comentarios || existingChamado?.comentarios || null,
  data_resolvido: dataResolvido || existingChamado?.data_resolvido,
  oculto: false
};
```

---

## Campos Adicionados

| Campo | Valor | Motivo |
|-------|-------|--------|
| `status` | `'Cancelado'` | Define explicitamente o status como Cancelado |
| `status_anterior` | Status atual do chamado | Guarda o status anterior para histórico |
| `sprint_id` | `null` | Remove o chamado da Sprint onde estava alocado |
| `selecionado_mes` | `false` | Remove da seleção do mês atual |
| `mes_priorizacao` | `null` | Limpa o mês de priorização |

---

## Resultado Esperado

Após esta correção:
1. Chamados que vierem com status "Cancelado" no Excel serão:
   - Removidos automaticamente de qualquer Sprint
   - Marcados como "Cancelado" no campo `status`
   - Terão o status anterior preservado para referência
2. O chamado RITM0079643 sairá da Sprint 2 e aparecerá como Cancelado

---

## Seção Técnica

A alteração será feita nas linhas 659-669 do arquivo `src/components/UploadExcel.tsx`, expandindo o objeto `canceladoData` com os campos necessários para garantir que chamados cancelados sejam completamente desvinculados de sprints e tenham seu status corretamente atualizado.

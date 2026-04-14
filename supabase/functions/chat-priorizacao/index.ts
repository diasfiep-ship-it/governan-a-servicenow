import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChamadoContext {
  numero: string;
  descricao: string | null;
  area_demandante: string;
  cliente: string | null;
  data_abertura: string | null;
  data_conclusao: string | null;
  comentarios: string | null;
  esforco: number | null;
  pontuacao_gut: number | null;
  gravidade: number | null;
  urgencia: number | null;
  tendencia: number | null;
  status: string | null;
  sprint_id: string | null;
  selecionado_mes: boolean;
}

function sseText(content: string, extraHeaders: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const payload = JSON.stringify({
        choices: [{ delta: { content } }],
      });
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "text/event-stream" },
  });
}

function normalizeQuestion(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, chamadosContext, userRoles, isAdmin } = await req.json() as {
      messages: Message[];
      chamadosContext: ChamadoContext[];
      userRoles: string[];
      isAdmin: boolean;
    };

    // Debug signal (helps confirm if the client is sending a partial dataset)
    console.log(
      "chat-priorizacao: chamadosContext length =",
      Array.isArray(chamadosContext) ? chamadosContext.length : "(invalid)",
    );

    const lastUserMessage = [...(messages || [])]
      .reverse()
      .find((m) => m.role === "user")?.content ?? "";
    const q = normalizeQuestion(lastUserMessage);

    // For metric questions, compute EXACT counts directly from the database (avoids any LLM/context truncation)
    const isCountIntent = /\bquant(os|as|idade)\b|\bqtd\b|\btotal\b|\bnumero\b|\bnumeros\b/.test(q);
    const isAguardPriorizacao = q.includes("aguard") && q.includes("prioriza");
    const isBacklog = q.includes("backlog");
    const isOpenBacklogIntent = isBacklog || (isCountIntent && (q.includes("abert") || q.includes("nao conclu") || q.includes("não conclu")));
    const isConcluidosIntent = isCountIntent && q.includes("conclu");

    if (isAguardPriorizacao || isOpenBacklogIntent || isConcluidosIntent) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Authorization header required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Backend env vars not configured");
      }

      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const withBaseFilters = (query: any) =>
        query.eq("cancelado", false).or("oculto.is.null,oculto.eq.false");

      if (isAguardPriorizacao) {
        const { count, error } = await withBaseFilters(
          supabaseUser
            .from("chamados")
            .select("id", { count: "exact", head: true }),
        ).eq("status", "Aguard. Priorização");
        if (error) throw error;

        const { data: exemplos, error: exemplosError } = await withBaseFilters(
          supabaseUser
            .from("chamados")
            .select("numero, area_demandante, descricao")
            .eq("status", "Aguard. Priorização")
            .order("pontuacao_gut", { ascending: false })
            .limit(10),
        );
        if (exemplosError) throw exemplosError;

        const lista = (exemplos || [])
          .map((c: { numero: string; area_demandante: string; descricao: string | null }) =>
            `- ${c.numero} (${c.area_demandante}) — ${c.descricao || "(sem descrição)"}`)
          .join("\n");

        const text =
          `No total, ==temos ${count ?? 0} chamado(s) com status \\\"Aguard. Priorização\\\"==.\n\n` +
          (lista ? `Exemplos (até 10):\n${lista}` : "Não encontrei exemplos para listar.");
        return sseText(text);
      }

      if (isOpenBacklogIntent) {
        const { count: openCount, error: openError } = await withBaseFilters(
          supabaseUser
            .from("chamados")
            .select("id", { count: "exact", head: true })
            .is("data_conclusao", null),
        );
        if (openError) throw openError;

        // Get a small breakdown by status (open items are usually < 1000)
        const { data: openRows, error: openRowsError } = await withBaseFilters(
          supabaseUser
            .from("chamados")
            .select("status")
            .is("data_conclusao", null),
        );
        if (openRowsError) throw openRowsError;

        const statusCounts = new Map<string, number>();
        for (const r of openRows || []) {
          const status = (r.status || "(sem status)").trim();
          statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        }

        const breakdown = [...statusCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([status, n]) => `- ${status}: ${n}`)
          .join("\n");

        const text =
          `Seu backlog hoje é ==${openCount ?? 0} chamado(s) em aberto== (não concluídos).\n\n` +
          (breakdown ? `Distribuição por status (abertos):\n${breakdown}` : "Não foi possível montar a distribuição por status.");
        return sseText(text);
      }

      // Concluídos (contagem exata)
      const { count: concludedCount, error: concludedError } = await withBaseFilters(
        supabaseUser
          .from("chamados")
          .select("id", { count: "exact", head: true })
          .not("data_conclusao", "is", null),
      );
      if (concludedError) throw concludedError;

      return sseText(`No total, ==temos ${concludedCount ?? 0} chamado(s) concluído(s)== na sua base de acesso.`);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context summary from chamados - process all records
    const contextSummary = chamadosContext
      .map((c, i) => {
        // Truncate comments more aggressively for large datasets
        const comentariosTruncated = c.comentarios 
          ? (c.comentarios.length > 200 ? c.comentarios.substring(0, 200) + "..." : c.comentarios)
          : "Sem comentários";
        
        return `#${i + 1}: ${c.numero} | ${c.area_demandante} | ${c.cliente || "N/A"} | ${c.status || "Pendente"} | Abertura: ${c.data_abertura || "N/A"} | Conclusão: ${c.data_conclusao || "-"} | GUT: ${c.pontuacao_gut || "-"} (G:${c.gravidade || "-"} U:${c.urgencia || "-"} T:${c.tendencia || "-"}) | Esforço: ${c.esforco || "-"}h | Sprint: ${c.sprint_id ? "Sim" : "Não"} | Desc: ${c.descricao || "N/A"} | Comentários: ${comentariosTruncated}`;
      })
      .join("\n");

    // Build access context description
    const accessContext = isAdmin 
      ? "Você tem acesso TOTAL a todos os chamados de todas as áreas."
      : `Você tem acesso aos chamados das seguintes áreas: ${userRoles.join(", ")}`;

    const systemPrompt = `Você é um ESPECIALISTA EM QUALIDADE NO ATENDIMENTO AO CLIENTE INTERNO do Sistema FIEP, com foco em análise de chamados e priorização técnica de TI. Você tem acesso aos dados de chamados do sistema.

CONTEXTO DE ACESSO:
${accessContext}

FILOSOFIA DE ATENDIMENTO:
- O CLIENTE ESTÁ SEMPRE NO CENTRO de todas as análises e recomendações
- Quando um cliente abre um chamado com dados insuficientes ou errados, o resolvedor deve SEMPRE entrar em contato para entender a demanda, orientar, e NUNCA fechar o chamado partindo da prerrogativa de dados insuficientes
- Aplique técnicas de ENCANTAMENTO DO CLIENTE (metodologia Disney): exceder expectativas, criar experiências memoráveis, resolver problemas com empatia
- Todo atendimento deve buscar a melhor forma de atender ao cliente, não apenas "resolver o ticket"
- Identifique oportunidades de melhoria na experiência do cliente interno
- Ao analisar priorização, considere sempre o impacto no cliente final

INSTRUÇÕES DE FORMATAÇÃO:
1. Responda sempre em português brasileiro
2. **IMPORTANTE**: Ao responder perguntas diretas, destaque a resposta principal usando ==destaque== (dois sinais de igual antes e depois)
   - Exemplo: Se perguntarem "Quantos chamados temos?", responda: "Temos ==15 chamados no total=="
   - Use este destaque APENAS para a informação que responde diretamente à pergunta
3. Seja conciso e objetivo
4. Ao analisar chamados, considere:
   - Pontuação GUT (Gravidade × Urgência × Tendência) - quanto maior, mais crítico
   - Esforço em horas - indica complexidade do trabalho
   - Tempo em aberto - chamados mais antigos podem ter maior urgência
   - Status atual - se está aguardando GUT, esforço, ou já foi priorizado
   - Área demandante - identifique padrões por área
5. Você pode ajudar com:
   - Análise de backlog e identificação de gargalos
   - Recomendações de priorização baseadas em GUT e esforço
   - Resumos por área, status ou período
   - Identificação de chamados críticos ou atrasados
   - Estatísticas e métricas dos chamados
   - Análise de qualidade no atendimento ao cliente
6. Se perguntado sobre áreas fora do seu acesso, informe educadamente que não tem permissão
7. Formate suas respostas de forma clara com listas e tabelas quando apropriado
8. Ao analisar comentários de chamados, identifique:
   - Oportunidades de melhoria no atendimento
   - Casos onde o cliente poderia ter sido melhor orientado
   - Boas práticas de encantamento que foram aplicadas

DADOS DOS CHAMADOS (${chamadosContext.length} registros):
${contextSummary}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Por favor, adicione créditos à sua conta." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar sua pergunta. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("chat-priorizacao error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

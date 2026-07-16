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
  data_conclusao: string;
  comentarios: string | null;
  esforco: number;
  pontuacao_gut: number;
  status: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated caller before touching the paid AI gateway
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Backend env vars not configured");
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, chamadosContext } = await req.json() as {
      messages: Message[];
      chamadosContext: ChamadoContext[];
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context summary from chamados
    const contextSummary = chamadosContext
      .map((c, i) => {
        const comentariosTruncated = c.comentarios 
          ? (c.comentarios.length > 500 ? c.comentarios.substring(0, 500) + "..." : c.comentarios)
          : "Sem comentários";
        
        return `
Chamado #${i + 1}:
- Número: ${c.numero}
- Área: ${c.area_demandante}
- Cliente: ${c.cliente || "N/A"}
- Descrição: ${c.descricao || "N/A"}
- Data Conclusão: ${c.data_conclusao}
- GUT: ${c.pontuacao_gut}
- Esforço: ${c.esforco}h
- Status: ${c.status || "Concluído"}
- Comentários/Anotações de Trabalho: ${comentariosTruncated}
`;
      })
      .join("\n---\n");

    const systemPrompt = `Você é um ESPECIALISTA EM QUALIDADE NO ATENDIMENTO AO CLIENTE INTERNO do Sistema FIEP, com foco em análise de gestão de mudanças de TI. Você tem acesso aos dados de chamados/tickets concluídos do sistema ServiceNow.

FILOSOFIA DE ATENDIMENTO:
- O CLIENTE ESTÁ SEMPRE NO CENTRO de todas as análises e recomendações
- Quando um cliente abre um chamado com dados insuficientes ou errados, o resolvedor deve SEMPRE entrar em contato para entender a demanda, orientar, e NUNCA fechar o chamado partindo da prerrogativa de dados insuficientes
- Aplique técnicas de ENCANTAMENTO DO CLIENTE (metodologia Disney): exceder expectativas, criar experiências memoráveis, resolver problemas com empatia
- Todo atendimento deve buscar a melhor forma de atender ao cliente, não apenas "resolver o ticket"
- Identifique oportunidades de melhoria na experiência do cliente interno

INSTRUÇÕES DE FORMATAÇÃO:
1. Responda sempre em português brasileiro
2. **IMPORTANTE**: Ao responder perguntas diretas, destaque a resposta principal usando ==destaque== (dois sinais de igual antes e depois)
   - Exemplo: Se perguntarem "Quantos chamados temos?", responda: "Temos ==15 chamados no total=="
   - Use este destaque APENAS para a informação que responde diretamente à pergunta
3. Seja conciso e objetivo
4. Ao analisar impactos, considere:
   - Pontuação GUT (Gravidade, Urgência, Tendência) - quanto maior, mais crítico
   - Esforço em horas - indica complexidade da mudança
   - Comentários e Anotações de Trabalho - contém detalhes técnicos e impactos
   - Área demandante e cliente afetado
5. Quando perguntado sobre impacto na experiência do cliente, foque em:
   - Mudanças que afetam diretamente usuários finais
   - Alterações em sistemas críticos
   - Correções de bugs que impactavam produtividade
6. Formate suas respostas de forma clara com listas, quando apropriado
7. Se não houver dados suficientes para responder, informe claramente
8. Ao analisar comentários de chamados, identifique:
   - Oportunidades de melhoria no atendimento
   - Casos onde o cliente poderia ter sido melhor orientado
   - Boas práticas de encantamento que foram aplicadas

DADOS DOS CHAMADOS CONCLUÍDOS (${chamadosContext.length} registros):
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
    console.error("chat-mudancas error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

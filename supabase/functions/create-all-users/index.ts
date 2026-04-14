import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// User definitions with login = email prefix
const USERS_TO_CREATE = [
  { login: 'ADM', role: 'ADM' },
  { login: 'TI', role: 'TI' },
  { login: 'CENTRO CIVICO - ENGENHARIA', role: 'CENTRO_CIVICO_ENGENHARIA' },
  { login: 'CENTRO CIVICO - GPOG', role: 'CENTRO_CIVICO_GPOG' },
  { login: 'GERENCIA DE CENTRO DE EVENTOS', role: 'GERENCIA_CENTRO_EVENTOS' },
  { login: 'GERENCIA DE COMPRAS E LOGISTICA', role: 'GERENCIA_COMPRAS_LOGISTICA' },
  { login: 'GERENCIA DE CONTABILIDADE PATRIMONIO E FINANCEIRO', role: 'GERENCIA_CONTABILIDADE_PATRIMONIO_FINANCEIRO' },
  { login: 'GERENCIA DE FACILITIES', role: 'GERENCIA_FACILITIES' },
  { login: 'GERENCIA DE PERFORMANCE E CANAIS DE VENDAS', role: 'GERENCIA_PERFORMANCE_CANAIS_VENDAS' },
  { login: 'GERENCIA DE PLANEJAMENTO E ORCAMENTO', role: 'GERENCIA_PLANEJAMENTO_ORCAMENTO' },
  { login: 'GERENCIA DE PROJETOS PROCESSOS E MELHORIA CONTINUA', role: 'GERENCIA_PROJETOS_PROCESSOS_MELHORIA' },
  { login: 'GERENCIA DE RECURSOS HUMANOS', role: 'GERENCIA_RECURSOS_HUMANOS' },
  { login: 'GERENCIA DE RELACIONAMENTO IEL', role: 'GERENCIA_RELACIONAMENTO_IEL' },
  { login: 'GERENCIA DE RISCOS E COMPLIANCE', role: 'GERENCIA_RISCOS_COMPLIANCE' },
  { login: 'GERENCIA DE TECNOLOGIA DA INFORMACAO', role: 'GERENCIA_TECNOLOGIA_INFORMACAO' },
  { login: 'RECURSOS HUMANOS', role: 'RECURSOS_HUMANOS' },
]

function generateEmail(login: string): string {
  // Convert login to email-safe format
  const emailPrefix = login
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, '.') // Replace non-alphanumeric with dots
    .replace(/\.+/g, '.') // Replace multiple dots with single
    .replace(/^\.|\.$/, '') // Remove leading/trailing dots
  return `${emailPrefix}@sistema.com`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const results = []
    const defaultPassword = '123'

    for (const userDef of USERS_TO_CREATE) {
      const email = generateEmail(userDef.login)
      console.log(`Creating user: ${userDef.login} with email: ${email}`)

      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
      const userExists = existingUser?.users.some(u => u.email === email)

      if (userExists) {
        results.push({ login: userDef.login, email, status: 'already_exists' })
        continue
      }

      // Create user
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: { full_name: userDef.login }
      })

      if (createError) {
        console.error(`Error creating user ${userDef.login}:`, createError)
        results.push({ login: userDef.login, email, status: 'error', error: createError.message })
        continue
      }

      // Assign role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userData.user.id, role: userDef.role })

      if (roleError) {
        console.error(`Error assigning role to ${userDef.login}:`, roleError)
        results.push({ login: userDef.login, email, status: 'error_role', error: roleError.message })
        continue
      }

      results.push({ login: userDef.login, email, status: 'created', userId: userData.user.id })
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

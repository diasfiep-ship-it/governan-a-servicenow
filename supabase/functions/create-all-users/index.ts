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
  const emailPrefix = login
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/, '')
  return `${emailPrefix}@sistema.com`
}

function generateStrongPassword(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Require an authenticated caller who already has the ADM role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const callerId = claimsData.claims.sub as string

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: callerRoles, error: rolesErr } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)

    if (rolesErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to verify caller role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!(callerRoles ?? []).some((r) => r.role === 'ADM')) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: ADM role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: Array<Record<string, unknown>> = []

    // Fetch existing users once
    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers()

    for (const userDef of USERS_TO_CREATE) {
      const email = generateEmail(userDef.login)
      const userExists = existingList?.users.some((u) => u.email === email)

      if (userExists) {
        results.push({ login: userDef.login, email, status: 'already_exists' })
        continue
      }

      const generatedPassword = generateStrongPassword()

      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name: userDef.login },
      })

      if (createError) {
        results.push({ login: userDef.login, email, status: 'error', error: createError.message })
        continue
      }

      // Force password change on first login (profile is created by handle_new_user trigger)
      await supabaseAdmin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', userData.user.id)

      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userData.user.id, role: userDef.role })

      if (roleError) {
        results.push({ login: userDef.login, email, status: 'error_role', error: roleError.message })
        continue
      }

      // Return the generated one-time password to the admin caller so they can share it securely
      results.push({
        login: userDef.login,
        email,
        status: 'created',
        userId: userData.user.id,
        temporary_password: generatedPassword,
      })
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

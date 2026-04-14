import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ManageUsersRequest {
  action: 'list' | 'create' | 'update' | 'delete'
  data?: {
    id?: string
    email?: string
    password?: string
    full_name?: string
    roles?: string[]  // Changed to array for multiple roles
    role?: string     // Keep for backward compatibility
    area_id?: string | null  // Area association
    reset_password?: boolean
    force_password_change?: boolean
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with user's token to verify they are admin
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    
    if (userError || !user) {
      console.error('User auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client for operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Check if user is ADM only (not ADM_TI)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    if (roleError) {
      console.error('Role check failed:', roleError)
      return new Response(
        JSON.stringify({ error: 'Error checking user role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has ADM role (only ADM, not ADM_TI)
    const hasAdmRole = roleData?.some(r => r.role === 'ADM')
    if (!hasAdmRole) {
      console.error('User does not have ADM role')
      return new Response(
        JSON.stringify({ error: 'Somente ADM pode gerenciar usuários' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: ManageUsersRequest = await req.json()
    const { action, data } = body

    console.log('Action:', action, 'Data:', JSON.stringify(data))

    switch (action) {
      case 'list': {
        // Get all users with their profiles and roles
        const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
        
        if (usersError) {
          console.error('Error listing users:', usersError)
          throw usersError
        }

        // Get all profiles
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('*')

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError)
          throw profilesError
        }

        // Get all roles
        const { data: roles, error: rolesError } = await supabaseAdmin
          .from('user_roles')
          .select('*')

        if (rolesError) {
          console.error('Error fetching roles:', rolesError)
          throw rolesError
        }

        // Get all areas
        const { data: areas, error: areasError } = await supabaseAdmin
          .from('areas')
          .select('id, nome')

        if (areasError) {
          console.error('Error fetching areas:', areasError)
        }

        // Combine data - now with multiple roles per user and area
        const usersWithRoles = users.users.map(u => {
          const profile = profiles?.find(p => p.id === u.id)
          const userRoles = roles?.filter(r => r.user_id === u.id).map(r => r.role) || []
          const userArea = areas?.find(a => a.id === profile?.area_id)
          return {
            id: u.id,
            email: u.email,
            full_name: profile?.full_name || u.user_metadata?.full_name || u.email,
            roles: userRoles,
            role: userRoles[0] || null, // Keep for backward compatibility
            area_id: profile?.area_id || null,
            area_nome: userArea?.nome || null,
            must_change_password: profile?.must_change_password || false,
            created_at: profile?.created_at || u.created_at
          }
        })

        return new Response(
          JSON.stringify({ users: usersWithRoles }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'create': {
        const roles = data?.roles || (data?.role ? [data.role] : [])
        
        if (!data?.email || !data?.password || roles.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Email, password and at least one role are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Create user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
          user_metadata: { full_name: data.full_name || data.email }
        })

        if (createError) {
          console.error('Error creating user:', createError)
          return new Response(
            JSON.stringify({ error: createError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Create profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: newUser.user.id,
            email: data.email,
            full_name: data.full_name || data.email,
            must_change_password: true,
            area_id: data.area_id || null
          })

        if (profileError) {
          console.error('Error creating profile:', profileError)
        }

        // Assign all roles
        for (const role of roles) {
          const { error: roleError } = await supabaseAdmin
            .from('user_roles')
            .insert({
              user_id: newUser.user.id,
              role: role
            })

          if (roleError) {
            console.error('Error assigning role:', roleError)
          }
        }

        console.log('User created successfully:', newUser.user.id, 'with roles:', roles)

        return new Response(
          JSON.stringify({ user: newUser.user, message: 'User created successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update': {
        if (!data?.id) {
          return new Response(
            JSON.stringify({ error: 'User ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log('Updating user:', data.id)
        console.log('Reset password:', data.reset_password, 'Password provided:', !!data.password)
        console.log('Force password change:', data.force_password_change)

        // Update roles if provided
        const roles = data.roles || (data.role ? [data.role] : null)
        if (roles !== null) {
          // Delete existing roles
          const { error: deleteError } = await supabaseAdmin
            .from('user_roles')
            .delete()
            .eq('user_id', data.id)

          if (deleteError) {
            console.error('Error deleting existing roles:', deleteError)
            throw deleteError
          }

          // Insert new roles
          for (const role of roles) {
            const { error: roleError } = await supabaseAdmin
              .from('user_roles')
              .insert({
                user_id: data.id,
                role: role
              })

            if (roleError) {
              console.error('Error assigning role:', roleError)
            }
          }
        }

        // Update profile if full_name provided
        if (data.full_name) {
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ full_name: data.full_name })
            .eq('id', data.id)

          if (profileError) {
            console.error('Error updating profile:', profileError)
          }

          // Also update user metadata
          await supabaseAdmin.auth.admin.updateUserById(data.id, {
            user_metadata: { full_name: data.full_name }
          })
        }

        // Update area if provided
        if (data.area_id !== undefined) {
          const { error: areaError } = await supabaseAdmin
            .from('profiles')
            .update({ area_id: data.area_id })
            .eq('id', data.id)

          if (areaError) {
            console.error('Error updating area:', areaError)
          }
        }

        // Reset password if requested
        if (data.reset_password && data.password) {
          console.log('Resetting password for user:', data.id)
          const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
            data.id,
            { password: data.password }
          )

          if (passwordError) {
            console.error('Error resetting password:', passwordError)
            return new Response(
              JSON.stringify({ error: 'Erro ao resetar senha: ' + passwordError.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          console.log('Password reset successful')
        }

        // Force password change if requested
        if (data.force_password_change !== undefined) {
          console.log('Setting must_change_password to:', data.force_password_change)
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ must_change_password: data.force_password_change })
            .eq('id', data.id)

          if (profileError) {
            console.error('Error updating must_change_password:', profileError)
            return new Response(
              JSON.stringify({ error: 'Erro ao atualizar flag de troca de senha: ' + profileError.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          console.log('must_change_password updated successfully')
        }

        console.log('User updated successfully:', data.id)

        return new Response(
          JSON.stringify({ message: 'User updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'delete': {
        if (!data?.id) {
          return new Response(
            JSON.stringify({ error: 'User ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Prevent self-deletion
        if (data.id === user.id) {
          return new Response(
            JSON.stringify({ error: 'Cannot delete your own account' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Delete user roles first
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', data.id)

        // Delete user (cascade will handle profiles)
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.id)

        if (deleteError) {
          console.error('Error deleting user:', deleteError)
          throw deleteError
        }

        console.log('User deleted successfully:', data.id)

        return new Response(
          JSON.stringify({ message: 'User deleted successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Error in manage-users:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

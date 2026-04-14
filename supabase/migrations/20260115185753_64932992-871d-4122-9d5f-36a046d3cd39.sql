-- Add data_conclusao to chamados for tracking when chamados are completed
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS data_conclusao timestamp with time zone;

-- Remove unique constraint on user_roles to allow multiple roles per user
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;

-- Add unique constraint on user_id + role combination instead (to prevent duplicate roles)
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
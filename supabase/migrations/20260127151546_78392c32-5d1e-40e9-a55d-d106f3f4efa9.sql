-- Create audit log table to track all user actions
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  user_email text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL, -- 'chamado', 'sprint', 'user', etc.
  entity_id text, -- ID of the affected entity
  details jsonb, -- Additional details about the change
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view the audit log
CREATE POLICY "Admins can view audit log"
ON public.audit_log
FOR SELECT
USING (is_admin(auth.uid()));

-- Allow authenticated users to insert (via application)
CREATE POLICY "Authenticated users can insert audit log"
ON public.audit_log
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX idx_audit_log_entity_type ON public.audit_log(entity_type);
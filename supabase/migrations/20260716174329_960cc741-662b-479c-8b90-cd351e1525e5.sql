
-- 1) Restrict evidence bucket SELECT to admins
DROP POLICY IF EXISTS "Anyone can view evidence" ON storage.objects;
CREATE POLICY "Admins can view evidence"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'evidencias-cancelamento' AND public.is_admin(auth.uid()));

-- 2) Restrict area users to only updating GUT/effort fields on chamados
CREATE OR REPLACE FUNCTION public.enforce_area_user_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.area_demandante IS DISTINCT FROM OLD.area_demandante
     OR NEW.cliente IS DISTINCT FROM OLD.cliente
     OR NEW.descricao IS DISTINCT FROM OLD.descricao
     OR NEW.area IS DISTINCT FROM OLD.area
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.item IS DISTINCT FROM OLD.item
     OR NEW.oferta IS DISTINCT FROM OLD.oferta
     OR NEW.sla IS DISTINCT FROM OLD.sla
     OR NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.data_abertura IS DISTINCT FROM OLD.data_abertura
     OR NEW.catalogo IS DISTINCT FROM OLD.catalogo
     OR NEW.grupo_atribuicao IS DISTINCT FROM OLD.grupo_atribuicao
     OR NEW.data_resolvido IS DISTINCT FROM OLD.data_resolvido
     OR NEW.data_fechamento IS DISTINCT FROM OLD.data_fechamento
     OR NEW.data_encerramento IS DISTINCT FROM OLD.data_encerramento
     OR NEW.data_previsto IS DISTINCT FROM OLD.data_previsto
     OR NEW.prioridade_calculada IS DISTINCT FROM OLD.prioridade_calculada
     OR NEW.selecionado_mes IS DISTINCT FROM OLD.selecionado_mes
     OR NEW.mes_priorizacao IS DISTINCT FROM OLD.mes_priorizacao
     OR NEW.sprint_id IS DISTINCT FROM OLD.sprint_id
     OR NEW.data_conclusao IS DISTINCT FROM OLD.data_conclusao
     OR NEW.area_modificada_por_admin IS DISTINCT FROM OLD.area_modificada_por_admin
     OR NEW.status_anterior IS DISTINCT FROM OLD.status_anterior
     OR NEW.cancelado IS DISTINCT FROM OLD.cancelado
     OR NEW.motivo_cancelamento IS DISTINCT FROM OLD.motivo_cancelamento
     OR NEW.evidencia_cancelamento_url IS DISTINCT FROM OLD.evidencia_cancelamento_url
     OR NEW.cancelado_em IS DISTINCT FROM OLD.cancelado_em
     OR NEW.cancelado_por IS DISTINCT FROM OLD.cancelado_por
     OR NEW.contagem_reabertura IS DISTINCT FROM OLD.contagem_reabertura
     OR NEW.aguardando_cliente IS DISTINCT FROM OLD.aguardando_cliente
     OR NEW.motivo_pendencia IS DISTINCT FROM OLD.motivo_pendencia
     OR NEW.encerrado_por IS DISTINCT FROM OLD.encerrado_por
     OR NEW.atribuido_a IS DISTINCT FROM OLD.atribuido_a
  THEN
    RAISE EXCEPTION 'Usuários de área só podem atualizar campos GUT (gravidade, urgência, tendência, esforço, pontuação GUT).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chamados_enforce_area_update_scope ON public.chamados;
CREATE TRIGGER chamados_enforce_area_update_scope
  BEFORE UPDATE ON public.chamados
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_area_user_update_scope();

-- 3) Lock down SECURITY DEFINER function execution from anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_area_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_area_id(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_area_name(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM anon, PUBLIC;

-- handle_new_user is an auth trigger only — revoke from everyone
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_area_user_update_scope() FROM anon, authenticated, PUBLIC;

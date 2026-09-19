CREATE OR REPLACE FUNCTION public._emit_journal(_tenant_id uuid, _entry_date date, _memo text, _source_type text, _source_id uuid, _lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  j_id   uuid;
  tot_dr numeric(14,2) := 0;
  tot_cr numeric(14,2) := 0;
  line   jsonb;
BEGIN
  PERFORM public.assert_period_open(_tenant_id, _entry_date);

  FOR line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    tot_dr := tot_dr + COALESCE((line->>'debit')::numeric,  0);
    tot_cr := tot_cr + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;

  IF ABS(tot_dr - tot_cr) > 0.005 THEN
    RAISE EXCEPTION
      '_emit_journal: unbalanced lines: debit %, credit % (source % %)',
      tot_dr, tot_cr, _source_type, _source_id;
  END IF;

  IF tot_dr = 0 AND tot_cr = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.journal_entries (
    tenant_id, entry_date, memo, source_ref_type, source_ref_id,
    total_debit, total_credit, status, created_by
  ) VALUES (
    _tenant_id, _entry_date, _memo, _source_type, _source_id,
    tot_dr, tot_cr, 'Posted', auth.uid()
  ) RETURNING id INTO j_id;

  -- Lines belong to the entry we just created, so the immutability guard
  -- must not fire while we populate them.
  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  FOR line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    INSERT INTO public.journal_lines (
      tenant_id, journal_id, account_id, debit, credit, memo
    ) VALUES (
      _tenant_id,
      j_id,
      (line->>'account_id')::uuid,
      COALESCE((line->>'debit')::numeric,  0),
      COALESCE((line->>'credit')::numeric, 0),
      line->>'memo'
    );
  END LOOP;
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);

  RETURN j_id;
END;
$function$;
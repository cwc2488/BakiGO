-- Correct member number for 陳佳昱 → 20702593
-- Safe to re-run: no-op if already correct or member not found.

DO $$
DECLARE
  target_number constant text := '20702593';
  old_number text;
  member_name constant text := '陳佳昱';
BEGIN
  SELECT member_number
  INTO old_number
  FROM public.members
  WHERE trim(name) = member_name
  ORDER BY created_at
  LIMIT 1;

  IF old_number IS NULL THEN
    RAISE NOTICE 'Member % not found — skip', member_name;
    RETURN;
  END IF;

  IF old_number = target_number THEN
    RAISE NOTICE 'Member % already has number % — skip', member_name, target_number;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.members
    WHERE member_number = target_number
      AND trim(name) <> member_name
  ) THEN
    RAISE EXCEPTION
      'Cannot assign % to % — number already used by another member',
      target_number,
      member_name;
  END IF;

  UPDATE public.organization_relationships
  SET child_member_number = target_number
  WHERE child_member_number = old_number;

  UPDATE public.organization_relationships
  SET parent_member_number = target_number
  WHERE parent_member_number = old_number;

  UPDATE public.members
  SET member_number = target_number
  WHERE trim(name) = member_name;

  RAISE NOTICE 'Updated % from % to %', member_name, old_number, target_number;
END $$;

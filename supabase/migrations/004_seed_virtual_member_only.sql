-- Seed virtual upline 00000 only (safe to re-run)
INSERT INTO public.members (
  id,
  member_number,
  name,
  email,
  role,
  current_level,
  sponsor_member_number
) VALUES (
  '00000000-0000-4000-a000-000000000001',
  '00000',
  '虛擬上線',
  'virtual-upline@baki-go.local',
  'member',
  'map',
  NULL
)
ON CONFLICT (member_number) DO NOTHING;

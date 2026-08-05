-- Reset all member/org data and seed virtual upline 00000
-- Run in Supabase SQL Editor after backing up if needed

-- 1. Clear organization relationships
DELETE FROM public.organization_relationships;

-- 2. Clear all members
DELETE FROM public.members;

-- 3. Clear all login accounts (Supabase Auth)
DELETE FROM auth.users;

-- 4. Seed virtual upline (member number 00000)
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
);

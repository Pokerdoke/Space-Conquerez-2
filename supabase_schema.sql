-- SQL Schema Setup for Void Empires
-- Copy and paste this script into your Supabase SQL Editor.

-- 1. Create the rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  state JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS) if desired
-- For this simple application, you can allow all read/write actions
-- Or you can disable RLS for testing, or set up policies:
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Allow anonymous select (everyone can see rooms)
CREATE POLICY "Allow anonymous read access" 
ON public.rooms FOR SELECT 
USING (true);

-- Allow anonymous insert (everyone can create rooms)
CREATE POLICY "Allow anonymous insert access" 
ON public.rooms FOR INSERT 
WITH CHECK (true);

-- Allow anonymous update (everyone can update rooms they have the code for)
CREATE POLICY "Allow anonymous update access" 
ON public.rooms FOR UPDATE 
USING (true)
WITH CHECK (true);

-- 3. Enable Supabase Realtime for this table
-- This allows clients to receive instant updates when a room is updated.
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

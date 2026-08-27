/*
# Yantric — Call Recordings with Supabase Storage

## Overview
This migration sets up Supabase Storage bucket for call recordings
with proper RLS policies so users can only access their own recordings.

## What it does:
1. Creates a private 'call-recordings' bucket in Supabase Storage
2. Adds RLS policies to restrict access to recording owners only
3. Enables authenticated users to upload and view their recordings
*/

-- Create the call-recordings bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-recordings',
  'call-recordings',
  false,  -- Private bucket
  104857600,  -- 100MB limit per file
  ARRAY['audio/webm', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the bucket
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can upload recordings to their own folder
DROP POLICY IF EXISTS "Users can upload their own recordings" ON storage.objects;
CREATE POLICY "Users can upload their own recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own recordings
DROP POLICY IF EXISTS "Users can view their own recordings" ON storage.objects;
CREATE POLICY "Users can view their own recordings"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own recordings
DROP POLICY IF EXISTS "Users can delete their own recordings" ON storage.objects;
CREATE POLICY "Users can delete their own recordings"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role can manage all recordings (for backend operations)
DROP POLICY IF EXISTS "Service role can manage all recordings" ON storage.objects;
CREATE POLICY "Service role can manage all recordings"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'call-recordings')
WITH CHECK (bucket_id = 'call-recordings');

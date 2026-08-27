/*
# Yantric Platform — Add Multi-Language Support

## Overview
Adds support for multiple languages per agent, allowing agents to speak in multiple languages
and switch between them based on user preference.

## Changes
1. Add `languages` array column to agents table
2. Migrate existing `language` values to `languages` array
3. Keep backward compatibility with single `language` field
*/

-- Add languages array column
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS languages text[] DEFAULT ARRAY['en-IN'];

-- Migrate existing language values to languages array
UPDATE public.agents SET languages = ARRAY[language] WHERE languages IS NULL OR languages = '{}';

-- Add comment
COMMENT ON COLUMN public.agents.languages IS 'Array of supported language codes (e.g., {en-IN, te-IN, hi-IN})';

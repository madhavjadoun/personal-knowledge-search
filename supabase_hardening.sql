-- =============================================================================
-- SUPABASE SECURITY HARDENING MIGRATION SCRIPT
-- =============================================================================
--
-- Instructions:
-- Run this script in the Supabase SQL Editor to enable Row Level Security (RLS)
-- and apply the least-privilege security policies for all tables and buckets.
--
-- This script is idempotent and safe to run multiple times.
--
-- =============================================================================

-- 1. Enable RLS on Database Tables
ALTER TABLE IF EXISTS public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_daily_credits ENABLE ROW LEVEL SECURITY;

-- 2. Drop Existing Public/Loose Policies (if any)
DROP POLICY IF EXISTS "Allow public read" ON public.documents;
DROP POLICY IF EXISTS "Allow public write" ON public.documents;
DROP POLICY IF EXISTS "Allow public read" ON public.chunks;
DROP POLICY IF EXISTS "Allow public write" ON public.chunks;
DROP POLICY IF EXISTS "Allow public read" ON public.quizzes;
DROP POLICY IF EXISTS "Allow public write" ON public.quizzes;
DROP POLICY IF EXISTS "Allow public read" ON public.quiz_questions;
DROP POLICY IF EXISTS "Allow public write" ON public.quiz_questions;
DROP POLICY IF EXISTS "Allow public read" ON public.user_daily_credits;
DROP POLICY IF EXISTS "Allow public write" ON public.user_daily_credits;

-- 3. Define Table RLS Policies (User Isolation)

-- Table: public.documents
DROP POLICY IF EXISTS "Users can manage their own documents" ON public.documents;
CREATE POLICY "Users can manage their own documents"
ON public.documents
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Table: public.chunks
DROP POLICY IF EXISTS "Users can manage their own chunks" ON public.chunks;
CREATE POLICY "Users can manage their own chunks"
ON public.chunks
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Table: public.quizzes
DROP POLICY IF EXISTS "Users can manage their own quizzes" ON public.quizzes;
CREATE POLICY "Users can manage their own quizzes"
ON public.quizzes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE public.documents.id = public.quizzes.document_id
    AND public.documents.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE public.documents.id = public.quizzes.document_id
    AND public.documents.user_id = auth.uid()
  )
);

-- Table: public.quiz_questions
DROP POLICY IF EXISTS "Users can manage their own quiz questions" ON public.quiz_questions;
CREATE POLICY "Users can manage their own quiz questions"
ON public.quiz_questions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quizzes
    JOIN public.documents ON public.documents.id = public.quizzes.document_id
    WHERE public.quizzes.id = public.quiz_questions.quiz_id
    AND public.documents.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quizzes
    JOIN public.documents ON public.documents.id = public.quizzes.document_id
    WHERE public.quizzes.id = public.quiz_questions.quiz_id
    AND public.documents.user_id = auth.uid()
  )
);

-- Table: public.user_daily_credits
DROP POLICY IF EXISTS "Users can manage their own credits" ON public.user_daily_credits;
CREATE POLICY "Users can manage their own credits"
ON public.user_daily_credits
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- 4. Enable RLS on Storage Objects & Secure Buckets
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- Make 'documents' bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

-- Drop existing storage policies on the bucket if any
DROP POLICY IF EXISTS "Public access to documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow user folder management" ON storage.objects;

-- Create secure policy for the 'documents' bucket
DROP POLICY IF EXISTS "Allow authenticated user folder management in documents bucket" ON storage.objects;
CREATE POLICY "Allow authenticated user folder management in documents bucket"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'documents'
  AND (select auth.uid()::text) = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'documents'
  AND (select auth.uid()::text) = (storage.foldername(name))[1]
);

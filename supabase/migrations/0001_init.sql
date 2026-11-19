-- RecallAI initial schema
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Subjects
-- ---------------------------------------------------------------------------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists subjects_user_idx on public.subjects (user_id);

-- ---------------------------------------------------------------------------
-- Documents (uploaded PDFs) and their extracted pages
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null,
  storage_path text,
  page_count int not null default 0,
  -- ready: every page extracted; partial: some pages unreadable; failed: nothing usable
  status text not null default 'processing' check (status in ('processing', 'ready', 'partial', 'failed')),
  failed_pages int[] not null default '{}',
  ocr_pages int[] not null default '{}',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists documents_subject_idx on public.documents (subject_id);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  page_number int not null,
  text text not null default '',
  method text not null check (method in ('text', 'ocr', 'failed')),
  unique (document_id, page_number)
);
create index if not exists document_pages_doc_idx on public.document_pages (document_id);

-- ---------------------------------------------------------------------------
-- Generated study guides (structured JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.study_guides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  document_ids uuid[] not null default '{}',
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists study_guides_subject_idx on public.study_guides (subject_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Quizzes, questions, answers
-- ---------------------------------------------------------------------------
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  mode text not null default 'standard' check (mode in ('standard', 'weak_topics', 'retry')),
  focus_topics text[] not null default '{}',
  question_count int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quizzes_subject_idx on public.quizzes (subject_id, created_at desc);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  position int not null,
  type text not null check (type in ('multiple_choice', 'true_false', 'fill_blank', 'short_answer', 'application')),
  topic text not null,
  difficulty int not null check (difficulty between 1 and 3),
  prompt text not null,
  options jsonb not null default '[]',
  -- answer key: { correctOptionIndex, correctAnswer, acceptableAnswers }
  answer jsonb not null,
  explanation text not null,
  sources jsonb not null default '[]',
  -- set when the question is a retry of an earlier question
  retry_of uuid references public.quiz_questions (id) on delete set null
);
create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  topic text not null,
  difficulty int not null,
  user_answer text not null,
  -- 1 = correct, 0.5 = partially correct, 0 = incorrect
  score numeric not null check (score in (0, 0.5, 1)),
  feedback text,
  created_at timestamptz not null default now(),
  unique (question_id)
);
create index if not exists quiz_answers_subject_idx on public.quiz_answers (subject_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security: every row belongs to exactly one user
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['subjects','documents','document_pages','study_guides','quizzes','quiz_questions','quiz_answers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for original PDFs (private). Files live under <user_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "pdfs: own folder read" on storage.objects;
drop policy if exists "pdfs: own folder write" on storage.objects;
drop policy if exists "pdfs: own folder delete" on storage.objects;
drop policy if exists "pdfs: own folder update" on storage.objects;

create policy "pdfs: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pdfs: own folder write" on storage.objects for insert to authenticated
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pdfs: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Needed for upload with upsert (re-uploading the same file).
create policy "pdfs: own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);

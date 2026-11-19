-- Newer Supabase projects do not grant Data API access to new tables automatically.
-- Signed-in users get table access; Row Level Security still limits them to their own rows.
-- The anon role gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.subjects,
  public.documents,
  public.document_pages,
  public.study_guides,
  public.quizzes,
  public.quiz_questions,
  public.quiz_answers
to authenticated;

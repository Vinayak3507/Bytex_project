ALTER TABLE public.question_sets
DROP CONSTRAINT IF EXISTS question_sets_title_check;

ALTER TABLE public.question_sets
ADD CONSTRAINT question_sets_title_check
CHECK (
  char_length(title) <= 120
  AND (
    status = 'draft'
    OR char_length(btrim(title)) > 0
  )
);

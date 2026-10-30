-- New sessions only: existing conversations are not enrolled in automatic cleanup.
CREATE TABLE IF NOT EXISTS public.story_session_lifetimes (
  story_session_id INTEGER PRIMARY KEY REFERENCES public.story_sessions(id),
  auth_session_id INTEGER NOT NULL REFERENCES public.user_sessions(id),
  user_id INTEGER NOT NULL REFERENCES public.users(id),
  learner_id INTEGER NOT NULL REFERENCES public.learners(id),
  ended_at TIMESTAMPTZ,
  cleaned_at TIMESTAMPTZ,
  user_turns INTEGER NOT NULL DEFAULT 0,
  activity_days DATE[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS story_session_lifetimes_pending_idx
  ON public.story_session_lifetimes(auth_session_id) WHERE cleaned_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pronunciation_session_lifetimes (
  practice_session_id INTEGER PRIMARY KEY REFERENCES public.speaking_practice_sessions(id),
  auth_session_id INTEGER NOT NULL REFERENCES public.user_sessions(id),
  learner_id INTEGER NOT NULL REFERENCES public.learners(id),
  user_id INTEGER NOT NULL REFERENCES public.users(id)
);

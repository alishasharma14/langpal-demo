-- Manual patch for shared Supabase projects where these tables already existed
-- before the latest auth/profile/matchmaking columns were added.
--
-- Safe to rerun: every schema change uses `if not exists`.
-- LangPal Live uses `display_name` for public identity. `first_name` and
-- `last_name` are kept as legacy compatibility fields.

alter table users
add column if not exists display_name text,
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists native_language text,
add column if not exists practice_language text;

alter table waiting_queue
add column if not exists display_name text,
add column if not exists native_language text,
add column if not exists practice_language text;

update users
set display_name = nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
where display_name is null
  and (first_name is not null or last_name is not null);

notify pgrst, 'reload schema';

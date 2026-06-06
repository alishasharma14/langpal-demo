alter table users
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists native_language text,
add column if not exists practice_language text;

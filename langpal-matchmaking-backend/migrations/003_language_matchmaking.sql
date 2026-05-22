alter table waiting_queue
add column if not exists native_language text,
add column if not exists practice_language text;
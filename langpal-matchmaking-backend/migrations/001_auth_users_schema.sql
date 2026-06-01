create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    password_hash text not null,
    first_name text,
    last_name text,
    native_language text,
    practice_language text,
    created_at timestamp default now()
);
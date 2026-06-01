create table if not exists waiting_queue (
    id serial primary key,
    user_id uuid references users(id) on delete cascade,
    socket_id text not null,
    display_name text,
    native_language text,
    practice_language text,
    created_at timestamp default now()
);

alter table waiting_queue add column if not exists display_name text;
alter table waiting_queue add column if not exists native_language text;
alter table waiting_queue add column if not exists practice_language text;

create table if not exists matches (
    id serial primary key,
    user1_id uuid references users(id) on delete cascade,
    user2_id uuid references users(id) on delete cascade,
    status text default 'active',
    created_at timestamp default now()
);

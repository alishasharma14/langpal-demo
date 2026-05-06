create table if not exists waiting_queue (
    id serial primary key,
    user_id uuid references user_profiles(id) on delete cascade,
    socket_id text not null,
    created_at timestamp default now()
);

create table if not exists matches (
    id serial primary key,
    user1_id uuid references user_profiles(id) on delete cascade,
    user2_id uuid references user_profiles(id) on delete cascade,
    status text default 'active',
    created_at timestamp default now()
);
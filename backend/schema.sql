create table if not exists users (
id serial primary key,
username text not null unique,
password_hash text not null,
role text not null default 'USER' check (role in ('USER','KIOSK','MERCHANT','ADMIN')),
credits integer not null default 0,
created_at timestamptz not null default now()
);


create table if not exists requests (
id uuid primary key, -- idempotency key from client (header)
actor_user_id integer references users(id) on delete set null,
target_user_id integer references users(id) on delete set null,
amount integer not null,
kind text not null check (kind in ('ADD','DEDUCT')),
created_at timestamptz not null default now()
);


create index if not exists idx_users_username on users(username);
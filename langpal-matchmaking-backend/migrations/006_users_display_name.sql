alter table users
add column if not exists display_name text;

update users
set display_name = nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
where display_name is null
  and (first_name is not null or last_name is not null);


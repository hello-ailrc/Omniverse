-- Omniverse: database setup for cloud sync.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Running it again later is safe.

-- Saved articles. The article text lives in "blocks"; it is cleared when an article is deleted.
create table if not exists public.docs (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         text    not null,
  title      text    not null default '',
  url        text,
  site       text,
  byline     text,
  saved_at   bigint  not null default 0,
  words      integer not null default 0,
  pos        integer not null default 0,
  blocks     jsonb   not null default '[]'::jsonb,
  deleted    boolean not null default false,
  updated_at bigint  not null default 0,          -- when a device last changed it (ms)
  synced_at  timestamptz not null default now(), -- when the server last accepted a change
  primary key (user_id, id)
);

-- Highlights, underlines, flags and notes.
create table if not exists public.marks (
  user_id      uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id           text    not null,
  doc_id       text    not null,
  block        integer not null,
  start_offset integer not null,
  end_offset   integer not null,
  color        text    not null,
  style        text    not null,
  flag         boolean not null default false,
  note         text,
  text         text    not null default '',
  created_at   bigint  not null default 0,
  deleted      boolean not null default false,
  updated_at   bigint  not null default 0,
  synced_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists docs_user_synced  on public.docs  (user_id, synced_at);
create index if not exists marks_user_synced on public.marks (user_id, synced_at);
create index if not exists marks_user_doc    on public.marks (user_id, doc_id);

-- The newest change wins: an older change arriving late from another device is ignored.
create or replace function public.omniverse_sync_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists docs_sync_stamp on public.docs;
create trigger docs_sync_stamp before insert or update on public.docs
  for each row execute function public.omniverse_sync_stamp();

drop trigger if exists marks_sync_stamp on public.marks;
create trigger marks_sync_stamp before insert or update on public.marks
  for each row execute function public.omniverse_sync_stamp();

-- Each signed-in person can only see and change their own rows.
alter table public.docs  enable row level security;
alter table public.marks enable row level security;

drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own marks" on public.marks;
create policy "own marks" on public.marks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.docs, public.marks to authenticated;
revoke all on public.docs, public.marks from anon;

-- Let other devices hear about changes straight away.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'marks') then
    alter publication supabase_realtime add table public.marks;
  end if;
end;
$$;

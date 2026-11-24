-- Database for the invitation page.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to re-run.
--
-- Security model
--   The page uses the *publishable* key, which acts as the `anon` role.
--   anon may only INSERT new rows (with length/format limits).
--   Nobody using the publishable key can read, update or delete anything.
--   You read the data in the Dashboard (Table Editor), which uses your own login.

-- ─────────────────────────────────────────────────────────────── bookings
create table if not exists public.bookings (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('accept', 'later')),
  activity    text check (activity is null or char_length(activity) <= 80),
  day         date,
  pickup_time text check (pickup_time is null or pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or pickup_time = 'any'),
  slot_label  text check (slot_label is null or char_length(slot_label) <= 80),
  note        text check (note is null or char_length(note) <= 200),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  -- An accepted booking must say what, which day and what time.
  check (kind = 'later' or (activity is not null and day is not null and pickup_time is not null))
);

-- ─────────────────────────────────────────────────────────────── feedback
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  message     text not null check (char_length(btrim(message)) between 1 and 1000),
  activity    text check (activity is null or char_length(activity) <= 80),
  picked_slot text check (picked_slot is null or char_length(picked_slot) <= 80),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300)
);

-- ─────────────────────────────────────────────────────────────── insert-only access
alter table public.bookings enable row level security;
alter table public.feedback enable row level security;

drop policy if exists "anyone can book" on public.bookings;
create policy "anyone can book" on public.bookings for insert to anon with check (true);

drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback" on public.feedback for insert to anon with check (true);

-- No select/update/delete policies exist, so those are denied. Tighten grants too.
revoke all on public.bookings, public.feedback from anon, authenticated;
grant insert (kind, activity, day, pickup_time, slot_label, note, user_agent) on public.bookings to anon;
grant insert (message, activity, picked_slot, user_agent) on public.feedback to anon;

-- ─────────────────────────────────────────────────────────────── Telegram notification (optional)
-- Sends you a Telegram message on every new booking / feedback.
-- Does nothing until you store two secrets in Vault (see README → "Telegram notifications"):
--   select vault.create_secret('<bot token>', 'telegram_bot_token');
--   select vault.create_secret('<your chat id>', 'telegram_chat_id');

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_telegram()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bot_token text;
  chat_id   text;
  msg       text;
begin
  select decrypted_secret into bot_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into chat_id   from vault.decrypted_secrets where name = 'telegram_chat_id';
  if bot_token is null or chat_id is null then
    return new;  -- not configured: just store the row
  end if;

  if tg_table_name = 'bookings' then
    if new.kind = 'accept' then
      msg := '🎟️ Em chốt vé rồi!' || chr(10)
          || '• Đi: ' || coalesce(new.activity, '?') || chr(10)
          || '• Khi nào: ' || coalesce(new.slot_label, new.day::text || ' ' || new.pickup_time)
          || coalesce(chr(10) || '• Em dặn: ' || new.note, '');
    else
      msg := '🕊️ Em bảo dạo này bận, để hôm khác nhé.'
          || coalesce(chr(10) || '• Em dặn: ' || new.note, '');
    end if;
  else
    msg := '📝 Em góp ý:' || chr(10) || new.message
        || coalesce(chr(10) || '(đang chọn: ' || nullif(concat_ws(' · ', new.activity, new.picked_slot), '') || ')', '');
  end if;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
    body    := jsonb_build_object('chat_id', chat_id, 'text', msg),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
exception when others then
  -- Never lose a booking because the notification failed.
  raise warning 'notify_telegram failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_telegram() from public, anon, authenticated;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert on public.bookings
  for each row execute function public.notify_telegram();

drop trigger if exists feedback_notify on public.feedback;
create trigger feedback_notify after insert on public.feedback
  for each row execute function public.notify_telegram();

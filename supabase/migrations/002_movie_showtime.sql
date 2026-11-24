-- Migration 002: movie bookings (movie, cinema, showtime).
-- Run once in Supabase SQL Editor on a database created before this change. Safe to re-run.
-- New databases: just run schema.sql, which already includes this.

alter table public.bookings add column if not exists movie    text check (movie is null or char_length(movie) <= 120);
alter table public.bookings add column if not exists cinema   text check (cinema is null or char_length(cinema) <= 80);
alter table public.bookings add column if not exists showtime text check (showtime is null or showtime ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

grant insert (movie, cinema, showtime) on public.bookings to anon;

-- Telegram message now includes the movie and showtime.
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
          || coalesce('• Phim: ' || new.movie || chr(10), '')
          || case
               when new.movie is not null then
                 '• Suất: ' || coalesce(new.showtime, '?') || ' ngày ' || to_char(new.day, 'DD/MM')
                 || coalesce(' tại ' || new.cinema, '') || chr(10)
                 || '• Đón em lúc: ' || new.pickup_time
               else
                 '• Khi nào: ' || coalesce(new.slot_label, new.day::text || ' ' || new.pickup_time)
             end
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


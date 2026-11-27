-- Migration 003: "Ai gửi" — every Telegram message ends with who sent it (device · page · browser id)
-- and the time, and tests from your own machine are tagged 🧪 TEST.
-- Run once in Supabase SQL Editor. Safe to re-run. New databases: schema.sql already includes this.
-- The page works before and after this runs (it retries without `sender` if the column is missing).

alter table public.bookings add column if not exists sender text check (sender is null or char_length(sender) <= 120);
alter table public.feedback add column if not exists sender text check (sender is null or char_length(sender) <= 120);

grant insert (sender) on public.bookings to anon;
grant insert (sender) on public.feedback to anon;

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
  device    text;
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

  -- Who sent it: the page fills `sender`; older cached pages only send user_agent, so guess the device from it.
  device := case
    when new.user_agent ilike '%zalo%'                                    then 'app Zalo'
    when new.user_agent ilike '%FBAN%' or new.user_agent ilike '%FBAV%'   then 'Messenger/Facebook'
    when new.user_agent ilike '%iphone%'                                  then '📱 iPhone'
    when new.user_agent ilike '%ipad%'                                    then '📱 iPad'
    when new.user_agent ilike '%android%'                                 then '📱 Android'
    when new.user_agent ilike '%macintosh%'                               then '💻 Mac'
    when new.user_agent ilike '%windows%'                                 then '💻 Windows'
    else 'không rõ thiết bị'
  end;
  msg := msg || chr(10) || '———' || chr(10)
      || '👤 Từ: ' || coalesce(new.sender, device || ' (trang bản cũ)')
      || chr(10) || '🕐 ' || to_char(new.created_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI:SS DD/MM');

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

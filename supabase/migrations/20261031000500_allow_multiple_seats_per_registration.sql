alter table public.event_seat_reservations
  drop constraint if exists event_seat_reservations_registration_id_key;

alter table public.event_seat_reservations
  add constraint event_seat_reservations_registration_seat_key
  unique (registration_id, seat_id);

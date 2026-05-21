-- When deleting a trip, remove linked processing records automatically.
-- Previously ON DELETE RESTRICT blocked DELETE on trips (HTTP 409 from PostgREST).

alter table processing_records
  drop constraint if exists processing_records_trip_id_fkey;

alter table processing_records
  add constraint processing_records_trip_id_fkey
  foreign key (trip_id) references trips(id) on delete cascade;

-- Test seed data for the Rice Management end-to-end MVP flow.
-- Run after migrations against a development database.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

insert into seasons (id, name, from_date, to_date, note)
values
  ('00000000-0000-4000-8000-000000000101', 'Dong Xuan 2026', '2026-01-01', '2026-04-30', 'Seed season for E2E test')
on conflict (id) do update set
  name = excluded.name,
  from_date = excluded.from_date,
  to_date = excluded.to_date,
  note = excluded.note;

insert into rice_types (id, name, note)
values
  ('00000000-0000-4000-8000-000000000201', 'OM 5451', 'Common test rice type'),
  ('00000000-0000-4000-8000-000000000202', 'Dai Thom 8', 'Secondary test rice type')
on conflict (id) do update set
  name = excluded.name,
  note = excluded.note;

insert into farmers (
  id,
  name,
  phone,
  citizen_id,
  bank_name,
  bank_account_number,
  bank_account_name,
  address,
  note
)
values
  (
    '00000000-0000-4000-8000-000000000301',
    'Nguyen Van A',
    '0901000001',
    '079201000001',
    'Agribank',
    '123456789',
    'NGUYEN VAN A',
    'Can Tho',
    'Seed farmer 1'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    'Tran Thi B',
    '0901000002',
    '079201000002',
    'Vietcombank',
    '987654321',
    'TRAN THI B',
    'An Giang',
    'Seed farmer 2'
  )
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  citizen_id = excluded.citizen_id,
  bank_name = excluded.bank_name,
  bank_account_number = excluded.bank_account_number,
  bank_account_name = excluded.bank_account_name,
  address = excluded.address,
  note = excluded.note;

insert into brokers (
  id,
  name,
  phone,
  citizen_id,
  bank_name,
  bank_account_number,
  bank_account_name,
  default_commission_per_kg,
  address,
  note
)
values
  (
    '00000000-0000-4000-8000-000000000401',
    'Le Van Broker',
    '0902000001',
    '079201000101',
    'ACB',
    '1122334455',
    'LE VAN BROKER',
    50,
    'Can Tho',
    'Seed broker with default commission'
  )
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  citizen_id = excluded.citizen_id,
  bank_name = excluded.bank_name,
  bank_account_number = excluded.bank_account_number,
  bank_account_name = excluded.bank_account_name,
  default_commission_per_kg = excluded.default_commission_per_kg,
  address = excluded.address,
  note = excluded.note;

insert into factories (
  id,
  name,
  type,
  phone,
  tax_code,
  bank_name,
  bank_account_number,
  bank_account_name,
  address,
  note
)
values
  (
    '00000000-0000-4000-8000-000000000501',
    'Co May Factory',
    'drying_milling',
    '0903000001',
    '1800000001',
    'BIDV',
    '5566778899',
    'CO MAY FACTORY',
    'Dong Thap',
    'Seed factory'
  )
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  phone = excluded.phone,
  tax_code = excluded.tax_code,
  bank_name = excluded.bank_name,
  bank_account_number = excluded.bank_account_number,
  bank_account_name = excluded.bank_account_name,
  address = excluded.address,
  note = excluded.note;

insert into transporter_boats (
  id,
  boat_name,
  owner_name,
  phone,
  citizen_id,
  bank_name,
  bank_account_number,
  bank_account_name,
  note
)
values
  (
    '00000000-0000-4000-8000-000000000601',
    'Ghe Ba Tan',
    'Pham Van Boat',
    '0904000001',
    '079201000201',
    'Sacombank',
    '6677889900',
    'PHAM VAN BOAT',
    'Seed transport boat'
  )
on conflict (id) do update set
  boat_name = excluded.boat_name,
  owner_name = excluded.owner_name,
  phone = excluded.phone,
  citizen_id = excluded.citizen_id,
  bank_name = excluded.bank_name,
  bank_account_number = excluded.bank_account_number,
  bank_account_name = excluded.bank_account_name,
  note = excluded.note;

insert into transport_routes (id, name, note)
values
  ('00000000-0000-4000-8000-000000000701', 'Field A to Co May', 'Seed multi-stop route')
on conflict (id) do update set
  name = excluded.name,
  note = excluded.note;

insert into transport_route_stops (id, route_id, stop_order, location_name, note)
values
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000701', 1, 'Field A', 'Start'),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000701', 2, 'Canal B', 'Middle stop'),
  ('00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000701', 3, 'Co May Factory', 'End')
on conflict (id) do update set
  route_id = excluded.route_id,
  stop_order = excluded.stop_order,
  location_name = excluded.location_name,
  note = excluded.note;

insert into authorization_letters (
  id,
  farmer_id,
  broker_id,
  signed_date,
  valid_from,
  valid_to,
  note
)
values
  (
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000401',
    '2026-01-10',
    '2026-01-10',
    '2026-04-30',
    'Seed authorization letter'
  )
on conflict (id) do update set
  farmer_id = excluded.farmer_id,
  broker_id = excluded.broker_id,
  signed_date = excluded.signed_date,
  valid_from = excluded.valid_from,
  valid_to = excluded.valid_to,
  note = excluded.note;

insert into transport_trips (
  id,
  code,
  transporter_boat_id,
  route_id,
  factory_id,
  season_id,
  rice_type_id,
  trip_date,
  loaded_weight_kg,
  unloaded_weight_kg,
  loss_weight_kg,
  loss_percent,
  transport_price_basis,
  transport_price,
  transport_cost,
  fuel_fee,
  labor_fee,
  weighing_fee,
  total_cost,
  payment_status,
  note
)
values
  (
    '00000000-0000-4000-8000-000000001001',
    'TT-2026-001',
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '2026-02-08',
    17500,
    17320,
    180,
    1.0286,
    'unloaded_weight',
    120,
    2078400,
    500000,
    300000,
    100000,
    2978400,
    'unpaid',
    'Seed transport trip'
  )
on conflict (id) do update set
  code = excluded.code,
  transporter_boat_id = excluded.transporter_boat_id,
  route_id = excluded.route_id,
  factory_id = excluded.factory_id,
  season_id = excluded.season_id,
  rice_type_id = excluded.rice_type_id,
  trip_date = excluded.trip_date,
  loaded_weight_kg = excluded.loaded_weight_kg,
  unloaded_weight_kg = excluded.unloaded_weight_kg,
  loss_weight_kg = excluded.loss_weight_kg,
  loss_percent = excluded.loss_percent,
  transport_price_basis = excluded.transport_price_basis,
  transport_price = excluded.transport_price,
  transport_cost = excluded.transport_cost,
  fuel_fee = excluded.fuel_fee,
  labor_fee = excluded.labor_fee,
  weighing_fee = excluded.weighing_fee,
  total_cost = excluded.total_cost,
  payment_status = excluded.payment_status,
  note = excluded.note;

insert into purchase_slips (
  id,
  season_id,
  farmer_id,
  broker_id,
  transport_trip_id,
  rice_type_id,
  authorization_letter_id,
  purchase_date,
  weight_kg,
  unit_price,
  total_amount,
  broker_commission_per_kg,
  broker_commission_total,
  payment_status,
  note
)
values
  (
    '00000000-0000-4000-8000-000000001101',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000801',
    '2026-02-08',
    10000,
    7200,
    72000000,
    50,
    500000,
    'paid',
    'Seed purchase slip'
  )
on conflict (id) do update set
  season_id = excluded.season_id,
  farmer_id = excluded.farmer_id,
  broker_id = excluded.broker_id,
  transport_trip_id = excluded.transport_trip_id,
  rice_type_id = excluded.rice_type_id,
  authorization_letter_id = excluded.authorization_letter_id,
  purchase_date = excluded.purchase_date,
  weight_kg = excluded.weight_kg,
  unit_price = excluded.unit_price,
  total_amount = excluded.total_amount,
  broker_commission_per_kg = excluded.broker_commission_per_kg,
  broker_commission_total = excluded.broker_commission_total,
  payment_status = excluded.payment_status,
  note = excluded.note;

insert into processing_price_books (
  id,
  factory_id,
  season_id,
  service_type,
  rice_type_id,
  unit_price,
  effective_from,
  effective_to
)
values
  (
    '00000000-0000-4000-8000-000000001201',
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    'drying',
    '00000000-0000-4000-8000-000000000201',
    180,
    '2026-01-01',
    '2026-04-30'
  )
on conflict (id) do update set
  factory_id = excluded.factory_id,
  season_id = excluded.season_id,
  service_type = excluded.service_type,
  rice_type_id = excluded.rice_type_id,
  unit_price = excluded.unit_price,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to;

insert into processing_records (
  id,
  transport_trip_id,
  factory_id,
  season_id,
  service_type,
  rice_type_id,
  input_weight_kg,
  output_weight_kg,
  loss_weight_kg,
  loss_percent,
  unit_price,
  total_cost,
  payment_status,
  processed_date,
  note
)
values
  (
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    'drying',
    '00000000-0000-4000-8000-000000000201',
    17320,
    15000,
    2320,
    13.3949,
    180,
    3117600,
    'unpaid',
    '2026-02-09',
    'Seed drying record'
  )
on conflict (id) do update set
  transport_trip_id = excluded.transport_trip_id,
  factory_id = excluded.factory_id,
  season_id = excluded.season_id,
  service_type = excluded.service_type,
  rice_type_id = excluded.rice_type_id,
  input_weight_kg = excluded.input_weight_kg,
  output_weight_kg = excluded.output_weight_kg,
  loss_weight_kg = excluded.loss_weight_kg,
  loss_percent = excluded.loss_percent,
  unit_price = excluded.unit_price,
  total_cost = excluded.total_cost,
  payment_status = excluded.payment_status,
  processed_date = excluded.processed_date,
  note = excluded.note;

insert into payments (
  id,
  payment_type,
  farmer_id,
  purchase_slip_id,
  amount,
  paid_date,
  method,
  note
)
values
  (
    '00000000-0000-4000-8000-000000001401',
    'farmer_payment',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000001101',
    72000000,
    '2026-02-10',
    'bank_transfer',
    'Seed farmer transfer'
  )
on conflict (id) do update set
  payment_type = excluded.payment_type,
  farmer_id = excluded.farmer_id,
  purchase_slip_id = excluded.purchase_slip_id,
  amount = excluded.amount,
  paid_date = excluded.paid_date,
  method = excluded.method,
  note = excluded.note;

insert into attachments (
  id,
  purchase_slip_id,
  file_name,
  file_path,
  file_type,
  file_size,
  type
)
values
  (
    '00000000-0000-4000-8000-000000001501',
    '00000000-0000-4000-8000-000000001101',
    'seed-transfer-receipt.txt',
    'seed/seed-transfer-receipt.txt',
    'text/plain',
    128,
    'transfer_receipt'
  )
on conflict (id) do update set
  purchase_slip_id = excluded.purchase_slip_id,
  file_name = excluded.file_name,
  file_path = excluded.file_path,
  file_type = excluded.file_type,
  file_size = excluded.file_size,
  type = excluded.type;

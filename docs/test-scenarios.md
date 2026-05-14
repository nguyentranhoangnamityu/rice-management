# Manual Test Scenarios

Use these scenarios to verify the MVP end-to-end flow. The optional seed data in `supabase/seed.sql` creates a complete sample flow using deterministic records.

## Seed Data Smoke Test

1. Apply migrations to a development Supabase project.
2. Run `supabase/seed.sql`.
3. Open the app and confirm these records exist:
   - Season: `Dong Xuan 2026`
   - Rice type: `OM 5451`
   - Farmers: `Nguyen Van A`, `Tran Thi B`
   - Broker: `Le Van Broker`
   - Factory: `Co May Factory`
   - Boat: `Ghe Ba Tan`
   - Route: `Field A to Co May`
   - Purchase batch: `PB-2026-001`
   - Transport trip: `TT-2026-001`

Note: the seed creates attachment metadata for `seed/seed-transfer-receipt.txt`, but it does not upload a real Storage object. Use the manual attachment test to verify real upload/open/delete behavior.

## 1. Create Season

1. Go to `Mua vu`.
2. Create a season with a clear name and date range.
3. Edit the name or note.
4. Confirm the list updates.

Expected:
- Date range validates correctly.
- Search/list remains usable on mobile.

## 2. Create Rice Type

1. Go to `Loai lua`.
2. Create a rice type.
3. Edit the note.
4. Confirm it appears in later purchase, transport, and processing dropdowns.

## 3. Create Farmer

1. Go to `Nong dan`.
2. Create a farmer with phone, citizen ID, address, and bank details.
3. Search by name, phone, and citizen ID.

Expected:
- Farmer appears in purchase item dropdown.
- Bank fields save and display.

## 4. Create Broker

1. Go to `Co lua`.
2. Create a broker with phone, citizen ID, bank details, and `default_commission_per_kg`.
3. Search by name, phone, and citizen ID.

Expected:
- Broker appears in purchase item dropdown.
- Default commission is available when adding purchase items.

## 5. Create Factory

1. Go to `Nha may`.
2. Create a factory with type, phone, tax code, bank details, and address.
3. Search by name, phone, and tax code.

Expected:
- Factory appears in transport trip and processing record dropdowns.

## 6. Create Boat

1. Go to `Ghe van chuyen`.
2. Create a boat with owner, phone, citizen ID, and bank details.
3. Search by boat name, owner, phone, and citizen ID.

Expected:
- Boat appears in transport trip dropdown.

## 7. Create Route With Multiple Stops

1. Go to `Tuyen van chuyen`.
2. Create a route with at least three stops.
3. Confirm the route displays as `Stop 1 -> Stop 2 -> Stop 3`.
4. Edit the route and add or remove a stop.

Expected:
- Stop order is preserved.
- Route appears in transport trip dropdown.

## 8. Create Purchase Batch

1. Go to `Dot mua`.
2. Create a purchase batch with code, season, from date, to date, and note.
3. Open the batch detail page.

Expected:
- Batch date range validates.
- Batch detail page loads.

## 9. Add Purchase Items

1. In purchase batch detail, add purchase items.
2. Select farmer, broker, rice type.
3. Enter weight and unit price.
4. Confirm broker commission per kg defaults from broker if set.

Expected calculations:
- `total_amount = weight_kg * unit_price`
- `broker_commission_total = weight_kg * broker_commission_per_kg`
- Batch totals update:
  - total weight
  - total purchase amount
  - total broker commission

## 10. Create Transport Trip

1. Go to `Chuyen ghe`.
2. Create a trip with boat, route, factory, season, rice type, date, weights, price basis, fees, and payment status.
3. Test each price basis:
   - loaded weight
   - unloaded weight
   - fixed

Expected calculations:
- `loss_weight_kg = loaded_weight_kg - unloaded_weight_kg`
- `loss_percent = loss_weight_kg / loaded_weight_kg * 100`
- transport cost follows selected basis
- `total_cost = transport_cost + fuel_fee + labor_fee + weighing_fee`

## 11. Assign Purchase Items To Transport Trip

1. Edit an existing transport trip.
2. Use the assignment panel to assign unassigned purchase items.
3. Unassign one item and assign it again.

Expected:
- Only unassigned items or items already on the current trip appear.
- Assigned purchase weight updates.
- Difference shows `assigned_weight - loaded_weight_kg`.
- Difference warning does not block saving.

## 12. Create Processing Record

1. Go to `Say xay xat`.
2. Create a processing record.
3. Select transport trip.

Expected auto-fill:
- factory from transport trip if present
- season from transport trip
- rice type from transport trip
- input weight from transport trip unloaded weight

Expected calculations:
- `loss_weight_kg = input_weight_kg - output_weight_kg`
- `loss_percent = loss_weight_kg / input_weight_kg * 100`
- `total_cost = input_weight_kg * unit_price`

## 13. Check Debts Dashboard

1. Go to `Cong no`.
2. Review the three debt sections:
   - broker commission debts
   - transport debts
   - factory processing debts
3. Filter by season.
4. Filter by payment status.

Expected:
- Broker debts group purchase items by broker.
- Transport debts group transport trips by boat.
- Factory debts group processing records by factory.
- No records are inserted into the `debts` table by this dashboard.

## 14. Upload Attachment

1. Ensure Supabase Storage bucket `documents` exists and policies allow the current user to upload/read/delete.
2. Go to `Chung tu`.
3. Select a parent entity, attachment type, and file.
4. Upload.
5. Open/download the file.
6. Delete the attachment.

Expected:
- Metadata is written to `attachments`.
- File is uploaded to Storage.
- Delete removes both metadata and the Storage file.

## 15. Export PDF/Excel

1. In purchase batch detail, export PDF and Excel.
2. In transport trips, export a trip PDF and Excel.
3. In processing records, export a record PDF and Excel.
4. In debts dashboard, export PDF and Excel.

Expected:
- Files download successfully.
- Exported values match the visible table and metrics.

## Mobile Layout Check

Test at a narrow viewport, approximately 390px wide:

1. Sidebar becomes horizontally scrollable.
2. Forms stack into one column.
3. Tables scroll horizontally instead of overflowing the page.
4. Touch targets remain easy to tap.
5. Export and action buttons remain reachable.

## Calculation Checklist

Use the seed data or your own test data:

- Purchase item:
  - `10000 kg * 7200 = 72000000`
  - `10000 kg * 50 = 500000`
- Transport:
  - `17500 - 17320 = 180 kg loss`
  - `180 / 17500 * 100 = 1.0286%`
  - `17320 * 120 = 2078400 transport cost`
  - `2078400 + 500000 + 300000 + 100000 = 2978400 total cost`
- Processing:
  - `17320 - 15000 = 2320 kg loss`
  - `2320 / 17320 * 100 = 13.3949%`
  - `17320 * 180 = 3117600 total cost`

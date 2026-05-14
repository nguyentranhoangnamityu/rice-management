# Data Model

## Core Tables

### farmers
Store farmer information.

### brokers
Store broker information.

### authorization_letters
Store authorization letters.

### purchase_batches
Store weekly purchase batches.

### purchase_items
Store purchase transactions.

### transporter_boats
Store transporters / boats.

### transport_routes
Store transport routes.

### transport_route_stops
Store multi-stop routes.

### transport_trips
Store transport trips.

### factories
Store drying/milling factories.

### processing_price_books
Store seasonal processing prices.

### processing_records
Store drying/milling records.

### debts
Store debt tracking.

### payments
Store payment records.

### attachments
Store uploaded files.

---

## Main Relationships

### purchase_batch
has many purchase_items

### broker
has many purchase_items

### transport_trip
contains many purchase_items

### processing_record
belongs to transport_trip

### debt
can belong to:
- broker
- transporter
- factory

### attachments
can belong to:
- purchase batch
- purchase item
- transport trip
- processing record
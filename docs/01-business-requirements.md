# Business Requirements

## Purchase Module

### Farmers
- Farmers can sell multiple times
- Store citizen ID, bank account, phone number, address

### Brokers
- Brokers are mandatory in purchase flow
- Brokers receive commission per kg
- Broker debts are settled at season end

### Authorization Letters
- Used when broker receives payment on behalf of farmer

### Purchase Batch
- One batch can contain many farmers
- Usually grouped weekly

### Purchase Item
Contains:
- farmer
- broker
- rice type
- weight
- unit price
- total amount
- commission price
- total commission

### Farmer Payment
- Payments are transferred individually
- Store transfer receipts

---

## Transport Module

### Transporters
Store:
- boat name
- owner
- phone number
- debt information

### Routes
Support:
- single route
- multi-stop route

Example:
Field → A → B → C

### Transport Trips
Contains:
- route
- boat
- rice type
- loaded weight
- unloaded weight
- transport loss
- transport price
- fuel fee
- labor fee
- weighting fee

### Transport Debt
- Settled at season end

---

## Drying / Milling Module

### Factories
- Chanh Duc (drying only)
- Co May (drying + milling)

### Processing Records
Tracked by:
- transport trip / boat

NOT by farmer.

Contains:
- service type
- rice type
- input weight
- output weight
- loss
- loss percentage
- unit price
- total cost

### Seasonal Prices
Prices:
- change by season
- calculated by kg

### Factory Debt
- Settled at season end

---

## Loss Tracking

Track:
- transport loss
- drying loss
- milling loss

---

## Attachments

Support:
- citizen ID
- authorization letters
- transfer receipts
- transport receipts
- processing receipts
- PDF export
- Excel export

---

## Main Goal

The system should:
- be simple
- fast
- easy to use
- support traceability
- support debt tracking
- support PDF export
# Purchase Flow Refactor

Old model:
- purchase_batches
- purchase_items

New model:
- purchase_slips

A purchase slip is now the main business transaction.

Each purchase slip contains:
- farmer
- broker
- transport trip
- rice type
- season
- weight
- unit price
- total amount
- broker commission
- authorization info
- payment info
- attachments

Authorization:
- optional
- broker may receive payment on behalf of farmer

The system should support generating authorization letters directly from purchase slips.
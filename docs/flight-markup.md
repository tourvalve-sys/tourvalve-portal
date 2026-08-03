# Flight Markup — How It Works

## What it is

Every flight fare and ancillary (baggage, seat, meal) that comes back from our two
suppliers — **Travelport** and **Atriptech** ("Atlas") — has a markup added on top
of the supplier's raw cost before it's shown to a customer or agent. The markup is
the portion of the price that is the company's margin; the rest is what we owe the
supplier.

This is a live, always-on part of pricing — not an optional add-on. It runs for
every search, every price confirmation, and every booking, for both suppliers.

## End-to-end flow

1. **Search** — When a customer/agent searches for flights, we call Travelport or
   Atlas and get back raw supplier fares. Before those fares are returned to the
   frontend, the markup service adds the configured markup and replaces the
   displayed price with the marked-up ("sell") price. The raw supplier cost and
   the markup amount itself are never sent to the browser — only the final price.

2. **Ancillaries (baggage, seats, meals)** — Same idea, at a smaller percentage.
   When a customer picks a seat or adds baggage, the price shown already has
   markup baked in.

3. **Booking** — When the customer actually books, the marked-up price they saw
   is what gets submitted. On the server, that sell price is split back apart
   into "base fare" and "markup amount," and both are stored on the booking
   record.

4. **Wallet crediting** — The markup amount from every booking (and every
   ancillary order) is automatically credited to an internal admin wallet as a
   ledger entry (`MARKUP_CREDIT` / `ANCILLARY_MARKUP_CREDIT`). This is what shows
   up on the Wallet page as "Live markup credits" — it's effectively the running
   total of profit earned across all bookings, updated in real time as bookings
   happen.

```
Supplier fare (Travelport/Atlas)
        │
        ▼
  + Markup applied  ──► price shown to customer (search, price, seat/baggage pick)
        │
        ▼
     Booking created ──► sell price split back into base + markup
        │
        ▼
  Markup credited to admin wallet ledger (MARKUP_CREDIT)
```

## How the markup amount is decided

- **Flights:** a percentage of the base fare (currently 10%). If no percentage is
  configured, there are legacy flat fallback amounts per cabin class (economy,
  business, first).
- **Ancillaries:** a percentage per type — baggage, seat, meal (currently 7%
  each, with a default fallback for any other type).
- Markup can be turned off entirely via a config flag, in which case customers
  pay exactly the supplier's price.

## Who doesn't get marked-up prices

There is one internal reserved admin account that always sees the raw supplier
cost with no markup applied — used for internal cost verification, not a
customer-facing account.

## How to use / adjust it

There is now an in-app **Markup Settings** page (`/markup-settings`) for this,
restricted to the reserved admin account (`admin@tourvalve.com`) — the same
access tier as `/reports` and the Wallet admin view. From that page an admin can:

1. View the current ticket and ancillary markup percentages/flat amounts.
2. Edit and save new values — changes apply immediately across search, pricing,
   and booking, with no redeploy or restart required.
3. See a "Recent Changes" history of every saved change (who changed what,
   from what value to what value, and when).

Markup config is no longer read from `appsettings.json`. It lives in a
DB-backed `MarkupSettings` table (a single settings row), read through a
short-lived (~30s) in-memory cache so the hot search/price/booking path isn't
hit with a DB query on every request, while still picking up admin edits
without a restart. Saving a change invalidates the cache immediately on the
instance that handled the write.

Backend API: `GET /api/admin/markup-settings`, `PUT /api/admin/markup-settings`,
`GET /api/admin/markup-settings/history` — all reserved-admin only
(`AdminMarkupSettingsController`).

## Where to look if debugging a price discrepancy

- **Search/price/seat markup application:** the flight controllers for each
  supplier (Travelport's flight controller, Atlas's flight controller).
- **Booking-time split of sell price into base + markup:** each supplier's
  booking controller, at the point where the booking is created.
- **Wallet crediting:** the shared booking-creation handler that all bookings
  flow through, regardless of supplier.
- **Config values:** the `MarkupSettings` DB table, editable via the
  `/markup-settings` admin page or the `AdminMarkupSettingsController` API.
  Reads are cached for ~30 seconds by `MarkupSettingsProvider` — if a just-saved
  change doesn't appear to take effect instantly on a different backend
  instance, that cache window is why.

# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Abhipal Singh
**Status:** draft

## Problem

Ops issues virtual cards by messaging the platform team by hand — 12 to 20 times a week, hours of turnaround, and last month two cards got the wrong spend limit because the request lived in a Slack thread. Ops needs to issue a card, see what's been issued, and check one, from inside the console they already use.

## Current state

- `src/data/types.ts` — no `Card` type exists yet. `Currency = "USD" | "EUR" | "GBP"` is already defined and is exactly the allowlist NWP-201 needs.
- `src/data/store.ts` — the `Store` interface has `merchants`, `payments`, `refunds`, `disputes`, `payouts`. No `cards` array. Store is a module-level object seeded once at boot and held on `globalThis` so Next's dev reload doesn't reset it — the same pattern will hold new cards for the life of the process.
- `src/data/generate.ts` — deterministic seed generator for the four existing entities, IDs formatted `pay_000001`, `re_000001`, `dp_000001`, `po_0001` via a shared `pad()` helper. Cards are not part of this generator; they're created by the user at runtime, not seeded.
- `src/data/queries.ts` — the payments query builder (`parseFilters`, `filterPayments`, `queryPayments`, `paymentById`, etc.). This is payment-specific and its own docstring says a second filter implementation is a defect — cards get a sibling file, not a squeeze into this one.
- `src/data/merchants.ts` — `merchants: Merchant[]` and `merchantById(id)`, ready to populate the "merchant" field on the issue form.
- `src/lib/money.ts` — `formatMoney`, `parseAmountToMinorUnits` (validates `"250.00"` → `25000`, returns `null` on bad input). This is the boundary parser for the spend-limit field; no second one gets written.
- `src/lib/dates.ts` — `formatDate`, `formatInZone` for created-date display.
- No Luhn helper exists anywhere in `src/lib/`. NWP-201 needs one; it's new, not a duplicate.
- No API route writes to the store yet — every handler in `src/app/api/` is a `GET`. `src/app/api/payments/route.ts` is the pattern to follow for shape (`NextResponse.json(...)`), but POST/PATCH here are new.
- `src/components/`: `Drawer.tsx` (Radix dialog under the hood, used today for the mobile sidebar) is the closest thing to a modal — there is no separate `Dialog` component despite `.claude/rules/components.md` mentioning one generically. The issue-card form uses `Drawer`, matching `components.md`'s requirement that dialogs be operable (focus trap and Escape-to-close already built into `DrawerContent`/`DrawerPrimitives`).
- `src/components/ui/payments/StatusBadge.tsx` — one badge component typed over `PaymentStatus | DisputeStatus | PayoutStatus`, with `LABELS`/`DOTS`/`VARIANTS` records. Card status is a fourth status union to add here, not a new badge component.
- `src/app/payments/page.tsx` + `src/app/payments/[id]/page.tsx` + `src/app/payments/filter-bar.tsx` — the list/detail/client-filter pattern to mirror for `/cards` and `/cards/[id]`.
- `src/app/siteConfig.ts` and `src/components/ui/navigation/AppSidebar.tsx` — nav is a static array keyed off `siteConfig.baseLinks`; adding Cards means one entry in each.
- The ticket says spend limits need a currency; the codebase's card rules (`cards.md`) add: test-BIN-only, generate on the server, reveal once, mask everywhere else, and the `active ⇄ frozen → cancelled` (terminal) state machine — matching the ticket's own "rules that make this real" section verbatim.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units, formatted only at the display edge | `CLAUDE.md`, `.claude/rules/money.md` | `$250.00` limit stored as float or string drifts on every comparison against spend |
| Generated numbers use the `4242` test BIN with a valid Luhn check digit | ticket, `.claude/rules/cards.md` | A number that isn't Luhn-valid or doesn't start `4242` risks resembling a real PAN |
| Reveal once: full number returned only in the creation response, masked (`•••• 4242`) everywhere else, never stored | ticket, `.claude/rules/cards.md`, `.claude/rules/api-routes.md` | A full number surviving into the store or a list/detail payload is the one thing this ticket cannot ship with |
| Status is a state machine: `active ⇄ frozen`, either → `cancelled`, `cancelled` terminal, guarded server-side | ticket, `.claude/rules/cards.md` | A `cancelled` card reactivated via a stale client, or a race that skips validation |
| Reject missing merchant, limit ≤ 0, limit > 5,000,000 minor units, currency outside `USD/EUR/GBP` — server-side | ticket | Client-only validation is bypassed by anything hitting the API directly |
| Validate anything from the client against an allowlist before it reaches the store | `.claude/rules/api-routes.md` | An unchecked currency or status string reaches the store |
| No database, ORM, or migration; cards live in the in-memory store for process lifetime | ticket, `CLAUDE.md` | Time spent on persistence earns nothing and costs the clock |

## Approach

Add a `Card` type and a `cards: Card[]` array to the store (starts empty — cards are created, not seeded). Add a sibling data module, `src/data/cards.ts`, mirroring `queries.ts`'s shape: an allowlist parser for creation input, a Luhn-based number generator in `src/lib/luhn.ts`, and store accessors (`createCard`, `listCards`, `cardById`, `transitionCardStatus`). Two route handlers: `GET/POST /api/cards` and `GET/PATCH /api/cards/[id]`. Two pages, `/cards` (list) and `/cards/[id]` (detail), following the payments pages' structure. The issue form is a `Drawer` (the codebase's existing modal primitive) with two internal steps — the form, then a one-time reveal screen shown right after a successful `POST` — rather than a full page, so ops never navigates away mid-task and the reveal state is impossible to accidentally re-enter (it lives in the drawer's local React state, not in any route or store field).

Spend is tracked as a `spentMinorUnits` field on the card, initialized to `0` at creation. There's no transaction feed linking payments to cards in this codebase and building one is not in the ticket's core criteria or its stretch goals — real card-network activity is explicitly out of scope. `spentMinorUnits` exists so the detail page's "spend against the limit" and the stretch spend-progress bar have a real field to render; it does not move on its own.

**Considered and rejected:** a full-page "Issue card" route (`/cards/new`) instead of a drawer. Rejected because every other creation-shaped affordance in this console is scoped to `.claude/rules/components.md`'s dialog rules, not a route, and a drawer keeps the reveal-once screen from ever being a URL someone can revisit or share.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | Add `Card`, `CardStatus`, `CardCategory` (if category lock is attempted) types |
| `src/data/store.ts` | change | Add `cards: Card[]` to `Store`, initialize empty in `createStore()` |
| `src/lib/luhn.ts` | add | `luhnCheckDigit`, `isValidLuhn`, `generateCardNumber` (4242 BIN) |
| `src/lib/luhn.test.ts` | add | Unit tests: check digit correctness, generated numbers always Luhn-valid and BIN-prefixed |
| `src/data/cards.ts` | add | `parseCardInput` (allowlist validation), `createCard`, `listCards`, `cardById`, `transitionCardStatus`, `maskCard` (strips full number, returns last4 + `•••• 4242` shape) |
| `src/data/cards.test.ts` | add | Status transition table: every legal edge passes, everything else (including any transition out of `cancelled`) is rejected |
| `src/app/api/cards/route.ts` | add | `GET` → `listCards()`; `POST` → validate via `parseCardInput`, call `createCard`, return the one response that carries the full number |
| `src/app/api/cards/[id]/route.ts` | add | `GET` → masked card or 404; `PATCH` → status transition, validated server-side, masked response |
| `src/app/cards/page.tsx` | add | List page: nickname, merchant, masked number, limit, status, created date; empty state; "Issue card" trigger |
| `src/app/cards/[id]/page.tsx` | add | Detail page: full masked record, spend vs. limit, freeze/unfreeze if attempting that stretch goal |
| `src/app/cards/issue-card-drawer.tsx` | add | Client component: `Drawer` with the form step and the one-time reveal step |
| `src/components/ui/payments/StatusBadge.tsx` | change | Extend the `AnyStatus` union and the three records with `active`/`frozen`/`cancelled` — reuse, not a new badge |
| `src/app/siteConfig.ts` | change | Add `baseLinks.cards: "/cards"` |
| `src/components/ui/navigation/AppSidebar.tsx` | change | Add a "Cards" nav entry, same shape as the other three |

## Plan

1. **Types + store** — `Card`/`CardStatus` added, `store.cards` exists and is empty on boot. Done when: `npm run build` typechecks with the new fields referenced nowhere else yet.
2. **Luhn helper + tests** — `generateCardNumber()` always returns a 16-digit `4242…` string that passes `isValidLuhn`. Done when: `npm test` passes `luhn.test.ts`.
3. **`src/data/cards.ts`** — validation, create, list, get, transition. Done when: a scratch script or test can create a card in-memory and read it back masked.
4. **API routes** — `POST /api/cards` rejects each of the four invalid inputs from the ticket with a real 4xx and a safe message; a valid `POST` returns the full number once. Done when: verified with `curl` for both the happy path and each rejection.
5. **`GET/PATCH /api/cards/[id]`** — masked detail, guarded status transitions. Done when: `curl`-ing a transition out of `cancelled` returns an error, not a 200.
6. **List page + nav** — `/cards` renders the table and the empty state, sidebar links to it. Done when: visiting `/cards` with zero cards shows the written empty state, not a blank table.
7. **Issue-card drawer** — form step collects nickname/merchant/limit/currency, submits to `POST /api/cards`, then swaps to the one-time reveal step showing the full number and a "copy" affordance. Done when: after closing the drawer, the number is gone from the DOM and from the card in the list (masked only).
8. **Detail page** — spend vs. limit, masked number, status. Done when: opening a freshly created card from the list shows its record with `spentMinorUnits: 0` against the limit.
9. **Stretch, time permitting, in this order**: freeze/unfreeze from the list (no reload), spend-progress bar past 80% turning amber, category lock at issue time, then tests beyond Luhn/status if time remains.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card via form/dialog; appears in the list | Manual: submit the drawer, confirm the row appears without a refresh |
| `/cards` list shows nickname, merchant, masked number, limit, status, created date | Manual: visual check of the table columns |
| Card detail shows full record + spend against limit | Manual: open a card, confirm all fields render including `spentMinorUnits`/limit |
| Generated numbers: `4242` BIN + valid Luhn | `luhn.test.ts` — generator output checked against `isValidLuhn` in a loop |
| Reveal once, masked forever | Manual + code check: `grep` the repo for the full number after creation — it exists only in the POST response type, never in `Card` |
| Server-side validation of the four cases | `curl` each invalid case against `POST /api/cards`, confirm 4xx and no card created |
| Status state machine guarded server-side | `cards.test.ts` — every transition pair, illegal ones rejected including anything out of `cancelled` |

## Risks

- Radix `Dialog`-based `Drawer` needs correct focus return on close for the accessibility rule in `components.md` — verify by tabbing through the form and confirming focus lands back on the "Issue card" trigger after both success and cancel.
- Luhn generation could theoretically collide on `last4` between two cards — acceptable, since `last4` is display-only and not a uniqueness key; the full generated number (not persisted) is what actually needs to be unique-looking, and BIN + random digits + check digit makes collision practically irrelevant for this dataset size.

## Out of scope

- Persistence beyond the process lifetime (NWP-203).
- Auth, roles, permissions.
- Real card-network calls or any live transaction feed updating `spentMinorUnits`.
- Editing a card's limit after issue (NWP-202).

## Open questions

- None blocking. If category lock (stretch) is attempted, the category list will be the same set used elsewhere in seed data if one exists, otherwise a short fixed list (e.g. `subscriptions`, `ad_spend`, `contractor_tools`) matching the ticket's own examples.

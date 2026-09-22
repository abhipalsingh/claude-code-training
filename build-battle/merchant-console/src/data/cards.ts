import { generateCardNumber } from "@/lib/luhn"
import { merchantById } from "./merchants"
import { store } from "./store"
import {
  Card,
  CardCategory,
  CardCreateInput,
  CardStatus,
  Currency,
} from "./types"

export const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

export const CATEGORIES: readonly CardCategory[] = [
  "vendor_subscriptions",
  "ad_spend",
  "contractor_tools",
]

export const CARD_STATUSES: readonly CardStatus[] = [
  "active",
  "frozen",
  "cancelled",
]

export const MAX_LIMIT_MINOR_UNITS = 5_000_000

/** "vendor_subscriptions" -> "Vendor subscriptions". Shared so the drawer and the detail page agree. */
export function humanizeCategory(category: CardCategory): string {
  const [first, ...rest] = category.split("_")
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ")
}

/** The full number never appears on this shape. Everywhere but the creation response, cards are masked. */
export type MaskedCard = Omit<Card, "last4"> & { maskedNumber: string }

export function maskCard(card: Card): MaskedCard {
  const { last4, ...rest } = card
  return { ...rest, maskedNumber: `•••• ${last4}` }
}

interface ValidationError {
  field: string
  message: string
}

/** Anything from the client is checked against an allowlist before it reaches the store. */
export function validateCardInput(input: {
  nickname?: unknown
  merchantId?: unknown
  limitMinorUnits?: unknown
  currency?: unknown
  category?: unknown
}): ValidationError | null {
  const nickname =
    typeof input.nickname === "string" ? input.nickname.trim() : ""
  if (!nickname) return { field: "nickname", message: "Nickname is required." }

  const merchantId =
    typeof input.merchantId === "string" ? input.merchantId : ""
  const merchant = merchantId ? merchantById(merchantId) : undefined
  if (!merchantId || !merchant) {
    return { field: "merchantId", message: "Choose a valid merchant." }
  }

  const limitMinorUnits = input.limitMinorUnits
  if (
    typeof limitMinorUnits !== "number" ||
    !Number.isInteger(limitMinorUnits) ||
    limitMinorUnits <= 0
  ) {
    return {
      field: "limitMinorUnits",
      message: "Spend limit must be a positive whole number of minor units.",
    }
  }
  if (limitMinorUnits > MAX_LIMIT_MINOR_UNITS) {
    return {
      field: "limitMinorUnits",
      message: `Spend limit cannot exceed ${MAX_LIMIT_MINOR_UNITS} minor units.`,
    }
  }

  if (
    typeof input.currency !== "string" ||
    !CURRENCIES.includes(input.currency as Currency)
  ) {
    return { field: "currency", message: "Currency must be one of USD, EUR, GBP." }
  }
  if (input.currency !== merchant.currency) {
    return {
      field: "currency",
      message: `Currency must match the merchant's currency (${merchant.currency}).`,
    }
  }

  if (input.category !== undefined && input.category !== null) {
    if (
      typeof input.category !== "string" ||
      !CATEGORIES.includes(input.category as CardCategory)
    ) {
      return { field: "category", message: "Unrecognized category." }
    }
  }

  return null
}

/** Call validateCardInput first. This assumes the shape already checked out. */
export function toCardCreateInput(input: {
  nickname: string
  merchantId: string
  limitMinorUnits: number
  currency: Currency
  category?: CardCategory | null
}): CardCreateInput {
  return {
    nickname: input.nickname.trim(),
    merchantId: input.merchantId,
    limitMinorUnits: input.limitMinorUnits,
    currency: input.currency,
    category: input.category ?? null,
  }
}

const pad = (n: number) => String(n).padStart(6, "0")

/** Long enough to absorb a double-click or one retried request; short enough to bound how long the full PAN sits here. */
const IDEMPOTENCY_TTL_MS = 60 * 1000

interface IdempotencyEntry {
  result: { card: Card; number: string }
  expiresAt: number
}

/** Keyed by the client's Idempotency-Key header. Entries expire; this never grows unbounded. */
const idempotencyCache = new Map<string, IdempotencyEntry>()

function pruneIdempotencyCache(now: number) {
  for (const [key, entry] of idempotencyCache) {
    if (entry.expiresAt <= now) idempotencyCache.delete(key)
  }
}

/** Generates the number server-side and returns it exactly once; every other read is masked. */
export function createCard(input: CardCreateInput): {
  card: Card
  number: string
} {
  const number = generateCardNumber()
  const card: Card = {
    id: `card_${pad(store.cards.length + 1)}`,
    nickname: input.nickname,
    merchantId: input.merchantId,
    last4: number.slice(-4),
    limitMinorUnits: input.limitMinorUnits,
    spentMinorUnits: 0,
    currency: input.currency,
    status: "active",
    category: input.category ?? null,
    createdAt: new Date().toISOString(),
  }
  store.cards.push(card)
  return { card, number }
}

/** Same as createCard, but a repeat call with the same key replays the original result. Null key opts out. */
export function createCardIdempotent(
  idempotencyKey: string | null,
  input: CardCreateInput,
): { card: Card; number: string } {
  const now = Date.now()
  pruneIdempotencyCache(now)

  if (idempotencyKey) {
    const cached = idempotencyCache.get(idempotencyKey)
    if (cached) return cached.result
  }
  const result = createCard(input)
  if (idempotencyKey) {
    idempotencyCache.set(idempotencyKey, {
      result,
      expiresAt: now + IDEMPOTENCY_TTL_MS,
    })
  }
  return result
}

export function listCards(): MaskedCard[] {
  return store.cards.map(maskCard)
}

export function cardById(id: string): Card | null {
  return store.cards.find((c) => c.id === id) ?? null
}

export function maskedCardById(id: string): MaskedCard | null {
  const card = cardById(id)
  return card ? maskCard(card) : null
}

/** active <-> frozen, either -> cancelled, cancelled is terminal. */
const LEGAL_TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function canTransitionCardStatus(
  from: CardStatus,
  to: CardStatus,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

/** Guards the state machine server-side. The client's guard is a convenience only. */
export function transitionCardStatus(
  id: string,
  to: CardStatus,
): { card: MaskedCard } | { error: string } {
  const card = cardById(id)
  if (!card) return { error: "Card not found." }
  if (!canTransitionCardStatus(card.status, to)) {
    return { error: `A ${card.status} card cannot move to ${to}.` }
  }
  card.status = to
  return { card: maskCard(card) }
}

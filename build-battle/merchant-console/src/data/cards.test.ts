import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  canTransitionCardStatus,
  cardById,
  createCard,
  createCardIdempotent,
  listCards,
  maskCard,
  toCardCreateInput,
  transitionCardStatus,
  validateCardInput,
} from "./cards"
import { merchants } from "./merchants"
import { store } from "./store"
import { CardStatus } from "./types"

// Tests reach into the store directly to reset it between cases, since cards
// are the one part of the store that isn't seeded fresh per run.
beforeEach(() => {
  store.cards.length = 0
})

const VALID_INPUT = {
  nickname: "Ad spend — Q4",
  merchantId: merchants[0].id,
  limitMinorUnits: 25000,
  currency: "USD" as const,
}

describe("validateCardInput", () => {
  const gbpMerchant = merchants.find((m) => m.currency === "GBP")!

  const CASES: [string, Record<string, unknown>, string | null][] = [
    ["valid input", {}, null],
    ["a missing merchant", { merchantId: "" }, "merchantId"],
    ["an unknown merchant id", { merchantId: "mch_ghost" }, "merchantId"],
    ["a zero limit", { limitMinorUnits: 0 }, "limitMinorUnits"],
    ["a negative limit", { limitMinorUnits: -100 }, "limitMinorUnits"],
    ["a limit above 5,000,000 minor units", { limitMinorUnits: 5_000_001 }, "limitMinorUnits"],
    ["a limit at exactly 5,000,000 minor units", { limitMinorUnits: 5_000_000 }, null],
    ["a currency outside USD/EUR/GBP", { currency: "JPY" }, "currency"],
    ["a blank nickname", { nickname: "   " }, "nickname"],
    ["a currency not matching the merchant's", { merchantId: gbpMerchant.id, currency: "USD" }, "currency"],
    ["a currency matching the merchant's", { merchantId: gbpMerchant.id, currency: "GBP" }, null],
  ]

  it.each(CASES)("handles %s", (_case, overrides, expectedField) => {
    const error = validateCardInput({ ...VALID_INPUT, ...overrides })
    expect(error?.field ?? null).toBe(expectedField)
  })
})

describe("createCard", () => {
  it("returns the number once, stores the card masked, active, with zero spend", () => {
    const { card, number } = createCard(toCardCreateInput(VALID_INPUT))
    expect(number).toHaveLength(16)
    expect(card.last4).toBe(number.slice(-4))
    expect(card.status).toBe("active")
    expect(card.spentMinorUnits).toBe(0)

    const masked = maskCard(cardById(card.id)!)
    expect(masked.maskedNumber).toBe(`•••• ${card.last4}`)
    expect((masked as { last4?: string }).last4).toBeUndefined()
    expect(listCards()).toHaveLength(1)
  })
})

describe("createCardIdempotent", () => {
  // Each case uses its own never-reused key: the idempotency cache is
  // process-lifetime, not reset by the store.cards.length reset above, so a
  // key shared across cases here would leak between them.
  it("creates once per key, replaying the same result on a repeat", () => {
    const input = toCardCreateInput(VALID_INPUT)
    const first = createCardIdempotent("idempotent-test-repeat", input)
    const second = createCardIdempotent("idempotent-test-repeat", input)

    expect(second.card.id).toBe(first.card.id)
    expect(second.number).toBe(first.number)
    expect(store.cards).toHaveLength(1)
  })

  it("creates a new card for a different key", () => {
    const input = toCardCreateInput(VALID_INPUT)
    createCardIdempotent("idempotent-test-distinct-a", input)
    createCardIdempotent("idempotent-test-distinct-b", input)
    expect(store.cards).toHaveLength(2)
  })

  it("always creates when no key is given", () => {
    const input = toCardCreateInput(VALID_INPUT)
    createCardIdempotent(null, input)
    createCardIdempotent(null, input)
    expect(store.cards).toHaveLength(2)
  })

  it("expires an entry after its TTL, so the cache never grows unbounded", () => {
    vi.useFakeTimers()
    try {
      const input = toCardCreateInput(VALID_INPUT)
      const first = createCardIdempotent("idempotent-test-ttl", input)
      vi.advanceTimersByTime(90 * 1000) // past the 60-second TTL
      const second = createCardIdempotent("idempotent-test-ttl", input)

      expect(second.card.id).not.toBe(first.card.id)
      expect(store.cards).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("card status transitions", () => {
  const CASES: [CardStatus, CardStatus, boolean][] = [
    ["active", "frozen", true],
    ["frozen", "active", true],
    ["active", "cancelled", true],
    ["frozen", "cancelled", true],
    ["active", "active", false],
    ["cancelled", "active", false],
    ["cancelled", "frozen", false],
    ["cancelled", "cancelled", false],
  ]

  it.each(CASES)("%s -> %s is legal: %s", (from, to, legal) => {
    expect(canTransitionCardStatus(from, to)).toBe(legal)
  })

  it("guards the transition server-side on a real card", () => {
    const { card } = createCard(toCardCreateInput(VALID_INPUT))
    const frozen = transitionCardStatus(card.id, "frozen")
    expect("card" in frozen && frozen.card.status).toBe("frozen")

    const cancelled = transitionCardStatus(card.id, "cancelled")
    expect("card" in cancelled && cancelled.card.status).toBe("cancelled")

    const revived = transitionCardStatus(card.id, "active")
    expect("error" in revived).toBe(true)
  })

  it("errors on an unknown card id", () => {
    const result = transitionCardStatus("card_ghost", "frozen")
    expect("error" in result).toBe(true)
  })

  it("records every transition in order, including the illegal one it rejected", () => {
    const { card } = createCard(toCardCreateInput(VALID_INPUT))
    transitionCardStatus(card.id, "frozen")
    transitionCardStatus(card.id, "cancelled")
    transitionCardStatus(card.id, "active") // rejected; must not appear below

    const statuses = cardById(card.id)!.statusHistory.map((e) => e.status)
    expect(statuses).toEqual(["active", "frozen", "cancelled"])
  })
})

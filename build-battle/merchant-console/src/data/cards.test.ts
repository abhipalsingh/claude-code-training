import { beforeEach, describe, expect, it } from "vitest"
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
  it("accepts valid input", () => {
    expect(validateCardInput(VALID_INPUT)).toBeNull()
  })

  it("rejects a missing merchant", () => {
    const error = validateCardInput({ ...VALID_INPUT, merchantId: "" })
    expect(error?.field).toBe("merchantId")
  })

  it("rejects an unknown merchant id", () => {
    const error = validateCardInput({ ...VALID_INPUT, merchantId: "mch_ghost" })
    expect(error?.field).toBe("merchantId")
  })

  it("rejects a zero limit", () => {
    const error = validateCardInput({ ...VALID_INPUT, limitMinorUnits: 0 })
    expect(error?.field).toBe("limitMinorUnits")
  })

  it("rejects a negative limit", () => {
    const error = validateCardInput({ ...VALID_INPUT, limitMinorUnits: -100 })
    expect(error?.field).toBe("limitMinorUnits")
  })

  it("rejects a limit above 5,000,000 minor units", () => {
    const error = validateCardInput({
      ...VALID_INPUT,
      limitMinorUnits: 5_000_001,
    })
    expect(error?.field).toBe("limitMinorUnits")
  })

  it("accepts a limit at exactly 5,000,000 minor units", () => {
    expect(
      validateCardInput({ ...VALID_INPUT, limitMinorUnits: 5_000_000 }),
    ).toBeNull()
  })

  it("rejects a currency outside USD/EUR/GBP", () => {
    const error = validateCardInput({ ...VALID_INPUT, currency: "JPY" })
    expect(error?.field).toBe("currency")
  })

  it("rejects a blank nickname", () => {
    const error = validateCardInput({ ...VALID_INPUT, nickname: "   " })
    expect(error?.field).toBe("nickname")
  })

  it("rejects a currency that doesn't match the merchant's currency", () => {
    const gbpMerchant = merchants.find((m) => m.currency === "GBP")!
    const error = validateCardInput({
      ...VALID_INPUT,
      merchantId: gbpMerchant.id,
      currency: "USD",
    })
    expect(error?.field).toBe("currency")
  })

  it("accepts a currency that matches the merchant's currency", () => {
    const gbpMerchant = merchants.find((m) => m.currency === "GBP")!
    expect(
      validateCardInput({
        ...VALID_INPUT,
        merchantId: gbpMerchant.id,
        currency: "GBP",
      }),
    ).toBeNull()
  })
})

describe("createCard", () => {
  it("stores the card without the full number and returns the number once", () => {
    const { card, number } = createCard(toCardCreateInput(VALID_INPUT))
    expect(number).toHaveLength(16)
    expect(card.last4).toBe(number.slice(-4))
    expect((card as unknown as { number?: string }).number).toBeUndefined()
    expect(card.status).toBe("active")
    expect(card.spentMinorUnits).toBe(0)
  })

  it("masks the number everywhere else", () => {
    const { card } = createCard(toCardCreateInput(VALID_INPUT))
    const masked = maskCard(cardById(card.id)!)
    expect(masked.maskedNumber).toBe(`•••• ${card.last4}`)
    expect((masked as { last4?: string }).last4).toBeUndefined()
  })

  it("appears in listCards", () => {
    createCard(toCardCreateInput(VALID_INPUT))
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
})

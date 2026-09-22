import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GENERATED_AT } from "./generate"
import { dailyVolume, headlineMetrics } from "./metrics"
import { store } from "./store"
import { Payment } from "./types"

const originalPayments = store.payments

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: "pay_test",
    merchantId: "mch_01",
    amount: 10000,
    currency: "USD",
    status: "captured",
    method: "card",
    cardBrand: "visa",
    last4: "4242",
    createdAt: GENERATED_AT.toISOString(),
    description: "test",
    ...overrides,
  }
}

beforeEach(() => {
  store.payments = []
})

afterEach(() => {
  store.payments = originalPayments
})

describe("dailyVolume", () => {
  it("buckets by the UTC calendar day, not the server's local day", () => {
    // 02:00 UTC is still the previous day in this process's local timezone
    // (America/New_York, UTC-4 in August) — exactly what a local-date
    // bucketing bug would misattribute to the wrong bucket.
    store.payments = [
      payment({ createdAt: "2026-08-13T02:00:00.000Z", amount: 5000 }),
    ]
    const days = dailyVolume(2)
    const aug13 = days.find((d) => d.date === "2026-08-13")!
    const aug12 = days.find((d) => d.date === "2026-08-12")!
    expect(aug13.captured).toBe(5000)
    expect(aug12.captured).toBe(0)
  })

  it("sums captured amounts within a bucket", () => {
    store.payments = [
      payment({ createdAt: GENERATED_AT.toISOString(), amount: 1 }),
      payment({ createdAt: GENERATED_AT.toISOString(), amount: 2 }),
    ]
    const days = dailyVolume(1)
    expect(days[days.length - 1].captured).toBe(3)
  })
})

describe("headlineMetrics", () => {
  it("counts only captured amounts toward gross volume, not refunds", () => {
    store.payments = [
      payment({ status: "captured", amount: 10000 }),
      payment({ status: "refunded", amount: 5000 }),
    ]
    expect(headlineMetrics().grossVolume).toBe(10000)
  })
})

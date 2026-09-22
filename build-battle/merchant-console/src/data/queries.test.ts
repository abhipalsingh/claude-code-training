import { describe, expect, it } from "vitest"
import { sortPayments } from "./queries"
import { Payment } from "./types"

function payment(id: string, amount: number): Payment {
  return {
    id,
    merchantId: "mch_01",
    amount,
    currency: "USD",
    status: "captured",
    method: "card",
    cardBrand: "visa",
    last4: "4242",
    createdAt: "2026-08-01T00:00:00.000Z",
    description: "test",
  }
}

describe("sortPayments", () => {
  it("sorts by amount numerically, not lexicographically", () => {
    // A string sort would put "900" after "1000" and "2000" ("1" < "2" < "9").
    // A correct numeric sort puts 900 first.
    const payments = [payment("a", 1000), payment("b", 900), payment("c", 2000)]

    const ascending = sortPayments(payments, "amount", "asc").map((p) => p.amount)
    expect(ascending).toEqual([900, 1000, 2000])

    const descending = sortPayments(payments, "amount", "desc").map((p) => p.amount)
    expect(descending).toEqual([2000, 1000, 900])
  })

  it("sorts by createdAt when no sort is given", () => {
    const older = payment("a", 100)
    older.createdAt = "2026-08-01T00:00:00.000Z"
    const newer = payment("b", 100)
    newer.createdAt = "2026-08-02T00:00:00.000Z"

    const result = sortPayments([newer, older])
    expect(result.map((p) => p.id)).toEqual(["b", "a"]) // default desc: newest first
  })
})

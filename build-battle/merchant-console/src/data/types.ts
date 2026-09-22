export type Currency = "USD" | "EUR" | "GBP"

export type PaymentStatus =
  | "authorized"
  | "captured"
  | "refunded"
  | "failed"
  | "disputed"

export type DisputeStatus = "needs_response" | "under_review" | "won" | "lost"

export type PayoutStatus = "paid" | "in_transit" | "pending"

export type CardStatus = "active" | "frozen" | "cancelled"

export type CardCategory =
  | "vendor_subscriptions"
  | "ad_spend"
  | "contractor_tools"

export interface Merchant {
  id: string
  name: string
  country: string
  /** IANA timezone. Display converts to this; storage never does. */
  timezone: string
  currency: Currency
  riskTier: "low" | "standard" | "elevated"
}

export interface Payment {
  id: string
  merchantId: string
  /** Integer minor units. Never a float. */
  amount: number
  currency: Currency
  status: PaymentStatus
  method: "card" | "wallet" | "bank_transfer"
  cardBrand: "visa" | "mastercard" | "amex" | null
  last4: string | null
  /** ISO 8601, always UTC. */
  createdAt: string
  description: string
}

export interface Refund {
  id: string
  paymentId: string
  amount: number
  currency: Currency
  reason: "requested_by_customer" | "duplicate" | "fraudulent"
  createdAt: string
}

export interface Dispute {
  id: string
  paymentId: string
  merchantId: string
  amount: number
  currency: Currency
  reasonCode: string
  status: DisputeStatus
  openedAt: string
  /** Evidence deadline, UTC. */
  evidenceDueAt: string
}

export interface Payout {
  id: string
  merchantId: string
  periodStart: string
  periodEnd: string
  gross: number
  fees: number
  net: number
  currency: Currency
  status: PayoutStatus
  paymentIds: string[]
}

export interface CardStatusEvent {
  status: CardStatus
  /** ISO 8601, always UTC. */
  at: string
}

export interface Card {
  id: string
  nickname: string
  merchantId: string
  /** Last four digits only. The full number is never stored. */
  last4: string
  /** Integer minor units. Never a float. */
  limitMinorUnits: number
  /** Integer minor units, starts at 0. No live transaction feed in this repo. */
  spentMinorUnits: number
  currency: Currency
  status: CardStatus
  category: CardCategory | null
  /** ISO 8601, always UTC. */
  createdAt: string
  /** Every status this card has held, oldest first. Starts with "active" at creation. */
  statusHistory: CardStatusEvent[]
}

export interface CardCreateInput {
  nickname: string
  merchantId: string
  limitMinorUnits: number
  currency: Currency
  category?: CardCategory | null
}

export interface PaymentFilters {
  status?: PaymentStatus | "all"
  merchantId?: string
  search?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
  sort?: "createdAt" | "amount"
  direction?: "asc" | "desc"
}

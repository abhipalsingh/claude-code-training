import { Divider } from "@/components/Divider"
import { SpendProgress } from "@/components/ui/cards/SpendProgress"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { humanizeCategory, maskedCardById } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CancelCardAction } from "./cancel-card-action"

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = maskedCardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)!

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
          {card.nickname}
        </h1>
        <span className="text-sm text-gray-500">{card.maskedNumber}</span>
        <StatusBadge status={card.status} />
      </div>
      <p className="mt-1 font-mono text-sm text-gray-500">{card.id}</p>

      <div className="mt-4">
        <CancelCardAction cardId={card.id} status={card.status} />
      </div>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Merchant">
          {merchant.name}
          <span className="ml-2 text-gray-500">{merchant.country}</span>
        </Field>
        <Field label="Card number">{card.maskedNumber}</Field>
        <Field label="Spend limit">
          {formatMoney(card.limitMinorUnits, card.currency)}
        </Field>
        <Field label="Spend against limit" className="sm:col-span-2 lg:col-span-3">
          <SpendProgress
            spentMinorUnits={card.spentMinorUnits}
            limitMinorUnits={card.limitMinorUnits}
            currency={card.currency}
          />
        </Field>
        <Field label="Category">
          {card.category ? humanizeCategory(card.category) : "—"}
        </Field>
        <Field label="Created (UTC)">
          <span className="font-mono text-sm">{card.createdAt}</span>
        </Field>
        <Field label={`Created (${merchant.timezone})`}>
          {formatInZone(card.createdAt, merchant.timezone)}
        </Field>
      </dl>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Status history
      </h2>
      <ol className="mt-4 space-y-4">
        {card.statusHistory.map((event, index) => (
          <li key={index} className="flex gap-3">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm capitalize text-gray-900 dark:text-gray-50">
                {event.status}
              </p>
              <p className="text-sm text-gray-500">
                {formatInZone(event.at, merchant.timezone)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">{children}</dd>
    </div>
  )
}

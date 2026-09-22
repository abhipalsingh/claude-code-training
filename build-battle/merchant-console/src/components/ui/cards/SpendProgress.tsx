import { Currency } from "@/data/types"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"

const AMBER_THRESHOLD = 80

/**
 * Read-only visualization of spend against a card's limit.
 * spentMinorUnits never moves on its own in this codebase (no live
 * transaction feed) — this component just renders whatever it's given.
 */
export function SpendProgress({
  spentMinorUnits,
  limitMinorUnits,
  currency,
}: {
  spentMinorUnits: number
  limitMinorUnits: number
  currency: Currency
}) {
  const rawPercent =
    limitMinorUnits > 0 ? (spentMinorUnits / limitMinorUnits) * 100 : 0
  const percent = Math.min(100, Math.max(0, rawPercent))
  const isNearLimit = percent >= AMBER_THRESHOLD

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Spend against limit"
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
      >
        <div
          className={cx(
            "h-full rounded-full",
            isNearLimit
              ? "bg-amber-500 dark:bg-amber-500"
              : "bg-blue-500 dark:bg-blue-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {formatMoney(spentMinorUnits, currency)} of{" "}
        {formatMoney(limitMinorUnits, currency)}
      </p>
    </div>
  )
}

"use client"

import { Button } from "@/components/Button"
import type { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState } from "react"

/** Freeze/unfreeze toggle for one card row; renders nothing once cancelled (terminal). */
export function CardStatusAction({
  cardId,
  nickname,
  status,
}: {
  cardId: string
  nickname: string
  status: CardStatus
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === "cancelled") {
    return null
  }

  const nextStatus: CardStatus = status === "active" ? "frozen" : "active"
  const label = status === "active" ? "Freeze" : "Unfreeze"

  async function handleClick() {
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error ?? "Something went wrong. Try again.")
        return
      }

      router.refresh()
    } catch {
      setError("Something went wrong. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="secondary"
        className="py-1 text-xs"
        disabled={isSubmitting}
        onClick={handleClick}
        aria-label={`${label} ${nickname}`}
      >
        {isSubmitting ? "Updating..." : label}
      </Button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-500">{error}</p>
      )}
    </div>
  )
}

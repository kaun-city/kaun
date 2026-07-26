import { ObjectPageSkeleton } from "@/components/india/ObjectPageSkeleton"

/**
 * Shown while a seat is being rendered for the first time — an ISR miss, or
 * the seconds after a deploy — and, more often, as the instant answer to a
 * click while the prerendered page is fetched.
 *
 * Five sections, because a constituency page has five: who holds the seat, in
 * Parliament, local area development funds, over time, central projects.
 */
export default function Loading() {
  return <ObjectPageSkeleton sections={5} backToMap />
}

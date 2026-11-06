export type ReviewRating = "again" | "hard" | "good" | "easy";

export function getReviewIntervalDays(rating: ReviewRating, intervalDays: number, repetitions: number) {
  const interval = Number.isFinite(intervalDays) ? Math.max(0, intervalDays) : 0;
  const count = Number.isFinite(repetitions) ? Math.max(0, Math.floor(repetitions)) : 0;

  if (rating === "again") return 1;
  if (rating === "hard") return Math.max(1, Math.round(interval * 1.2));
  if (rating === "easy") return Math.max(2, Math.round(interval * 2.5));
  if (count === 0) return 1;
  if (count === 1) return 3;
  return Math.max(1, Math.round(interval * 2.2));
}

import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";

// FSRS scheduling (ts-fsrs, pre-trained default weights, desired retention 0.9).
// Each card's full FSRS state is serialized to JSON in the cards table.

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));

export { Rating };

export function newCardState(now = new Date()): Card {
  return createEmptyCard(now);
}

export function serializeCard(card: Card): string {
  return JSON.stringify(card);
}

export function deserializeCard(json: string): Card {
  const raw = JSON.parse(json);
  return {
    ...raw,
    due: new Date(raw.due),
    last_review: raw.last_review ? new Date(raw.last_review) : undefined,
  } as Card;
}

/** Apply a review; returns the updated card state. Rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export function reviewCard(card: Card, rating: 1 | 2 | 3 | 4, now = new Date()): Card {
  const result = scheduler.next(card, now, rating as Grade);
  return result.card;
}

/** Predicted probability of recall right now (the forgetting curve). */
export function retrievability(card: Card, now = new Date()): number {
  if (card.reps === 0) return 1; // never studied — no forgetting has started
  const r = scheduler.get_retrievability(card, now, false);
  return typeof r === "number" && isFinite(r) ? Math.max(0, Math.min(1, r)) : 1;
}

import type { Metadata } from "next";

import { CardverseCanvas } from "@/components/cardverse-canvas";
import { getCards } from "@/lib/cardapi";
import { FILTERS, type CardFilter } from "@/lib/types";

export const metadata: Metadata = {
  title: "Explore cards — Cardverse",
  description: "Explore popular US consumer credit cards on an interactive canvas.",
};

export const revalidate = 86_400;

type CardsPageProps = {
  searchParams: Promise<{ filter?: string; card?: string }>;
};

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const [cards, params] = await Promise.all([getCards(), searchParams]);
  const requestedFilter = FILTERS.some((filter) => filter.id === params.filter)
    ? (params.filter as CardFilter)
    : "all";
  const requestedCard = cards.some(
    (card) => card.id === params.card && (requestedFilter === "all" || card.filters.includes(requestedFilter)),
  )
    ? params.card
    : undefined;

  return (
    <CardverseCanvas cards={cards} initialFilter={requestedFilter} initialCardId={requestedCard} />
  );
}

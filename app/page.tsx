import { Landing } from "@/components/landing";
import { getCards } from "@/lib/cardapi";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cards = await getCards();
  return <Landing cards={cards} />;
}

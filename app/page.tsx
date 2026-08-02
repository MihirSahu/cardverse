import { Landing } from "@/components/landing";
import { getCards } from "@/lib/cardapi";

export const revalidate = 86_400;

export default async function HomePage() {
  const cards = await getCards();
  return <Landing cards={cards} />;
}

import { StarField } from "@/components/star-field";

export default function Loading() {
  return (
    <main className="loading-screen" aria-label="Loading Cardverse">
      <StarField subtle />
      <span className="loading-wordmark">Cardverse</span>
    </main>
  );
}

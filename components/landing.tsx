"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { ArrowIcon } from "@/components/icons";
import { StarField } from "@/components/star-field";
import { shouldBypassImageOptimization } from "@/lib/artwork";
import type { Card } from "@/lib/types";

type LandingProps = {
  cards: Card[];
};

const positions = [
  { left: "7%", top: "17%", scale: 0.78, opacity: 0.64 },
  { left: "81%", top: "13%", scale: 0.7, opacity: 0.7 },
  { left: "18%", top: "64%", scale: 0.62, opacity: 0.56 },
  { left: "72%", top: "70%", scale: 0.72, opacity: 0.58 },
  { left: "8%", top: "43%", scale: 0.76, opacity: 0.74 },
  { left: "84%", top: "46%", scale: 0.66, opacity: 0.66 },
  { left: "34%", top: "76%", scale: 0.63, opacity: 0.6 },
  { left: "59%", top: "12%", scale: 0.58, opacity: 0.56 },
  { left: "76%", top: "37%", scale: 0.7, opacity: 0.7 },
];

export function Landing({ cards }: LandingProps) {
  const router = useRouter();
  const [entering, setEntering] = useState(false);
  const displayedCards = useMemo(() => cards.slice(0, positions.length), [cards]);

  function enterCanvas() {
    if (entering) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEntering(true);
    window.setTimeout(() => router.push("/cards"), reducedMotion ? 80 : 720);
  }

  return (
    <main className={`landing${entering ? " landing--entering" : ""}`}>
      <StarField subtle />

      <header className="landing-header">
        <span className="landing-wordmark">Cardverse</span>
        <span className="eyebrow">{cards.length} cards</span>
      </header>

      <div className="landing-card-field" aria-hidden="true">
        {displayedCards.map((card, index) => {
          const position = positions[index];
          const style = {
            left: position.left,
            top: position.top,
            opacity: position.opacity,
            "--card-scale": position.scale,
          } as CSSProperties;
          return (
            <div
              className={`landing-card${card.id === "chase-sapphire-preferred" ? " landing-card--entry" : ""}`}
              key={card.id}
              style={style}
            >
              <Image
                src={card.artworkUrl}
                alt=""
                fill
                sizes="(max-width: 720px) 30vw, 150px"
                draggable={false}
                unoptimized={shouldBypassImageOptimization(card.artworkUrl)}
              />
            </div>
          );
        })}
      </div>

      <section className="landing-intro" aria-labelledby="landing-title">
        <h1 id="landing-title">Cardverse</h1>
        <p>Browse popular US credit cards and compare rewards, fees, and terms.</p>
        <button className="primary-button" onClick={enterCanvas} type="button">
          <span>Explore cards</span>
          <ArrowIcon />
        </button>
      </section>

      <p className="sr-only" aria-live="polite">{entering ? "Opening the card canvas" : ""}</p>
    </main>
  );
}

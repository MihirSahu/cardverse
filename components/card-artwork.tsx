"use client";

import Image from "next/image";
import { useState } from "react";

import { pendingArtworkUrl, shouldBypassImageOptimization } from "@/lib/artwork";
import type { ArtworkOrientation } from "@/lib/types";

type CardArtworkProps = {
  artworkUrl: string;
  orientation: ArtworkOrientation;
  alt: string;
  sizes: string;
};

export function CardArtwork({ artworkUrl, orientation, alt, sizes }: CardArtworkProps) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const source = failedArtworkUrl === artworkUrl ? pendingArtworkUrl : artworkUrl;

  return (
    <Image
      src={source}
      alt={alt}
      className={`card-artwork card-artwork--${orientation}`}
      fill
      sizes={sizes}
      draggable={false}
      unoptimized={shouldBypassImageOptimization(source)}
      onError={() => {
        if (source !== pendingArtworkUrl) setFailedArtworkUrl(artworkUrl);
      }}
    />
  );
}

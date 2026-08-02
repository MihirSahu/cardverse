"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { shouldBypassImageOptimization } from "@/lib/artwork";
import type { Card } from "@/lib/types";

type CardRotatorProps = {
  card: Card;
};

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  velocityYaw: number;
  velocityPitch: number;
  moved: boolean;
};

export function CardRotator({ card }: CardRotatorProps) {
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState | null>(null);
  const inertiaFrame = useRef<number | null>(null);
  const lastTapAt = useRef(0);

  function stopInertia() {
    if (inertiaFrame.current != null) {
      window.cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = null;
    }
  }

  function reset() {
    stopInertia();
    setYaw(0);
    setPitch(0);
  }

  function startInertia(velocityYaw: number, velocityPitch: number) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let nextYawVelocity = velocityYaw;
    let nextPitchVelocity = velocityPitch;

    function tick() {
      nextYawVelocity *= 0.9;
      nextPitchVelocity *= 0.86;

      if (Math.abs(nextYawVelocity) < 0.08 && Math.abs(nextPitchVelocity) < 0.04) {
        inertiaFrame.current = null;
        return;
      }

      setYaw((value) => value + nextYawVelocity);
      setPitch((value) => Math.max(-18, Math.min(18, value + nextPitchVelocity)));
      inertiaFrame.current = window.requestAnimationFrame(tick);
    }

    inertiaFrame.current = window.requestAnimationFrame(tick);
  }

  useEffect(() => () => stopInertia(), []);

  return (
    <div
      className={`card-rotator${dragging ? " card-rotator--dragging" : ""}`}
      role="group"
      aria-label={`Interactive model of ${card.name}. Drag or use arrow keys to rotate. Double-click to reset.`}
      tabIndex={0}
      onDoubleClick={reset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 30 : 12;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          setYaw((value) => value - step);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          setYaw((value) => value + step);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          setPitch((value) => Math.max(-18, value - 5));
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          setPitch((value) => Math.min(18, value + 5));
        } else if (event.key === "Home") {
          event.preventDefault();
          event.stopPropagation();
          reset();
        }
      }}
      onPointerDown={(event) => {
        stopInertia();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          yaw,
          pitch,
          lastX: event.clientX,
          lastY: event.clientY,
          lastAt: event.timeStamp,
          velocityYaw: 0,
          velocityPitch: 0,
          moved: false,
        };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        const elapsed = Math.max(8, event.timeStamp - drag.current.lastAt);
        drag.current.velocityYaw = Math.max(
          -3.5,
          Math.min(3.5, (event.clientX - drag.current.lastX) * 0.72 * (16 / elapsed)),
        );
        drag.current.velocityPitch = Math.max(
          -1,
          Math.min(1, -(event.clientY - drag.current.lastY) * 0.18 * (16 / elapsed)),
        );
        drag.current.lastX = event.clientX;
        drag.current.lastY = event.clientY;
        drag.current.lastAt = event.timeStamp;
        if (Math.hypot(dx, dy) > 6) drag.current.moved = true;
        setYaw(drag.current.yaw + dx * 0.72);
        setPitch(Math.max(-18, Math.min(18, drag.current.pitch - dy * 0.18)));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          const finishedDrag = drag.current;
          drag.current = null;
          setDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);

          if (!finishedDrag.moved) {
            const now = performance.now();
            if (now - lastTapAt.current < 350) reset();
            lastTapAt.current = now;
          } else {
            startInertia(finishedDrag.velocityYaw, finishedDrag.velocityPitch);
          }
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
    >
      <div
        className="card-3d"
        style={{ transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)` }}
      >
        <div className="card-3d__face card-3d__face--front">
          <Image
            src={card.artworkUrl}
            alt={`${card.name} front`}
            fill
            sizes="(max-width: 720px) 72vw, 390px"
            draggable={false}
            unoptimized={shouldBypassImageOptimization(card.artworkUrl)}
          />
        </div>
        <div className="card-3d__face card-3d__face--back" aria-hidden="true">
          <div className="card-back-stripe" />
          <div className="card-back-signature" />
          <div className="card-back-copy">
            <span>{card.issuer}</span>
            <strong>{card.shortName}</strong>
          </div>
        </div>
      </div>
      <span className="rotation-hint">Drag to rotate · Double-click to reset</span>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { Brand } from "@/components/brand";
import { CardArtwork } from "@/components/card-artwork";
import { ChevronIcon, FilterIcon, GripIcon } from "@/components/icons";
import { StarField } from "@/components/star-field";
import { FILTERS, type Card, type CardFilter } from "@/lib/types";

const CardDetailPanel = dynamic(
  () => import("@/components/card-detail-panel").then((module) => module.CardDetailPanel),
  { ssr: false },
);
const CardRotator = dynamic(
  () => import("@/components/card-rotator").then((module) => module.CardRotator),
  { ssr: false },
);

type CardverseCanvasProps = {
  cards: Card[];
  initialFilter?: CardFilter;
  initialCardId?: string;
};

type Offset = { x: number; y: number };
type Drag = { pointerId: number; x: number; y: number; origin: Offset; moved: boolean };
type HistoryAction = "push" | "replace";

const WORLD_WIDTH = 2500;
const BASE_WORLD_HEIGHT = 2700;
const DESIGNED_LAYOUT_SIZE = 28;
const OVERFLOW_BAND_HEIGHT = 380;
const BOUNDARY_GUTTER = 72;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.15;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function clampAxis(offset: number, viewportSize: number, worldSize: number, zoom: number) {
  const scaledWorldSize = worldSize * zoom;
  if (scaledWorldSize <= viewportSize) return (viewportSize - scaledWorldSize) / 2;

  const minimum = viewportSize - scaledWorldSize - BOUNDARY_GUTTER;
  const maximum = BOUNDARY_GUTTER;
  return Math.min(maximum, Math.max(minimum, offset));
}

function clampOffset(
  offset: Offset,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  worldHeight: number,
): Offset {
  return {
    x: clampAxis(offset.x, viewportWidth, WORLD_WIDTH, zoom),
    y: clampAxis(offset.y, viewportHeight, worldHeight, zoom),
  };
}

function offsetsMatch(first: Offset, second: Offset) {
  return Math.abs(first.x - second.x) < 0.1 && Math.abs(first.y - second.y) < 0.1;
}

function cardBaseWidth(viewportWidth: number) {
  if (viewportWidth <= 520) return Math.min(278, viewportWidth * 0.72);
  return Math.min(380, viewportWidth * 0.29);
}

function cardDimensions(card: Card, baseWidth: number, scale: number) {
  const longEdge = baseWidth * scale;
  return card.artworkOrientation === "portrait"
    ? { width: longEdge / 1.586, height: longEdge }
    : { width: longEdge, height: longEdge / 1.586 };
}

function getWorldHeight(cardCount: number) {
  const overflowBands = Math.ceil(Math.max(0, cardCount - DESIGNED_LAYOUT_SIZE) / 5);
  return BASE_WORLD_HEIGHT + overflowBands * OVERFLOW_BAND_HEIGHT;
}

function buildCashAppCanvasLayout(viewportWidth: number, cardCount: number): Card["world"][] {
  const centerX = 1070;
  const centerScale = 0.95;
  const surroundingScale = 0.72;
  const baseWidth = cardBaseWidth(viewportWidth);
  const centerAxis = centerX + (baseWidth * centerScale) / 2;
  const surroundingWidth = baseWidth * surroundingScale;
  const centerLaneX = centerAxis - surroundingWidth / 2;
  const viewportLeft = centerAxis - viewportWidth / 2;
  const viewportRight = centerAxis + viewportWidth / 2;
  const edgeReveal = Math.min(72, Math.max(44, viewportWidth * 0.09));
  const leftLaneX = Math.max(16, viewportLeft + edgeReveal - surroundingWidth);
  const rightLaneX = Math.min(
    WORLD_WIDTH - surroundingWidth - 16,
    viewportRight - edgeReveal,
  );

  const positions: Card["world"][] = [
    // The first seven positions reproduce the centered Cash App composition:
    // one hero, a vertical center stream, and partial cards at both edges.
    { x: centerX, y: 1000, scale: centerScale, depth: "near" },
    { x: centerLaneX, y: 500, scale: surroundingScale, depth: "mid" },
    { x: leftLaneX, y: 760, scale: surroundingScale, depth: "far" },
    { x: rightLaneX, y: 720, scale: surroundingScale, depth: "far" },
    { x: leftLaneX, y: 1260, scale: surroundingScale, depth: "far" },
    { x: rightLaneX, y: 1310, scale: surroundingScale, depth: "far" },
    { x: centerLaneX, y: 1650, scale: surroundingScale, depth: "mid" },
    { x: 260, y: 1780, scale: 0.52, depth: "far" },
    { x: 2140, y: 270, scale: 0.52, depth: "far" },

    // The remaining curated cards continue as staggered streams across the
    // bounded field. Deliberately varied y positions avoid a catalog grid.
    { x: 100, y: 180, scale: 0.58, depth: "far" },
    { x: 560, y: 240, scale: 0.62, depth: "mid" },
    { x: 1510, y: 170, scale: 0.58, depth: "far" },
    { x: 2070, y: 480, scale: 0.6, depth: "far" },
    { x: 40, y: 1060, scale: 0.56, depth: "far" },
    { x: 650, y: 550, scale: 0.6, depth: "mid" },
    { x: 1480, y: 990, scale: 0.58, depth: "far" },
    { x: 2140, y: 1120, scale: 0.54, depth: "far" },
    { x: 70, y: 1480, scale: 0.56, depth: "far" },
    { x: 650, y: 1510, scale: 0.6, depth: "mid" },
    { x: 1490, y: 1540, scale: 0.58, depth: "far" },
    { x: 2050, y: 1720, scale: 0.6, depth: "far" },
    { x: 320, y: 2110, scale: 0.58, depth: "far" },
    { x: 790, y: 2010, scale: 0.62, depth: "mid" },
    { x: 1330, y: 2100, scale: 0.58, depth: "far" },
    { x: 1810, y: 2170, scale: 0.62, depth: "mid" },
    { x: 40, y: 2440, scale: 0.52, depth: "far" },
    { x: 1050, y: 2390, scale: 0.58, depth: "far" },
    { x: 2150, y: 2450, scale: 0.52, depth: "far" },
  ];

  const overflowX = [120, 570, 1050, 1530, 2070];
  const overflowStagger = [0, 90, 25, 120, 55];
  while (positions.length < cardCount) {
    const overflowIndex = positions.length - DESIGNED_LAYOUT_SIZE;
    const lane = overflowIndex % overflowX.length;
    const band = Math.floor(overflowIndex / overflowX.length);
    positions.push({
      x: overflowX[lane],
      y: BASE_WORLD_HEIGHT + band * OVERFLOW_BAND_HEIGHT + 60 + overflowStagger[lane],
      scale: lane % 2 === 0 ? 0.56 : 0.6,
      depth: lane === 2 ? "mid" : "far",
    });
  }

  return positions;
}

function buildCardsUrl(filter: CardFilter, cardId: string | null) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (cardId) params.set("card", cardId);
  const query = params.toString();
  return query ? `/cards?${query}` : "/cards";
}

function readCardsUrl(cards: Card[]) {
  const params = new URLSearchParams(window.location.search);
  const requestedFilter = params.get("filter");
  const filter = FILTERS.some((option) => option.id === requestedFilter)
    ? requestedFilter as CardFilter
    : "all";
  const requestedCard = params.get("card");
  const cardId = cards.some(
    (card) => card.id === requestedCard && (filter === "all" || card.filters.includes(filter)),
  )
    ? requestedCard
    : null;

  return { filter, cardId };
}

export function CardverseCanvas({ cards, initialFilter = "all", initialCardId }: CardverseCanvasProps) {
  const viewportRef = useRef<HTMLElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const selectionDialogRef = useRef<HTMLDivElement>(null);
  const selectionTriggerRef = useRef<HTMLElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressPointerClickUntil = useRef(0);
  const centered = useRef(false);
  const historyAction = useRef<HistoryAction>("replace");
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [activeFilter, setActiveFilter] = useState<CardFilter>(initialFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialCardId ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState("");

  const filteredCards = useMemo(
    () => cards.filter((card) => activeFilter === "all" || card.filters.includes(activeFilter)),
    [activeFilter, cards],
  );

  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;
  const activeFilterLabel = FILTERS.find((filter) => filter.id === activeFilter)?.label ?? "All cards";
  const layoutWidth = viewportWidth;
  const layoutHeight = viewportHeight;
  const baseWidth = cardBaseWidth(layoutWidth);
  const worldHeight = getWorldHeight(cards.length);
  const canvasPositions = useMemo(() => {
    const layout = buildCashAppCanvasLayout(viewportWidth, cards.length);
    return new Map(cards.map((card, index) => [card.id, layout[index]]));
  }, [cards, viewportWidth]);
  const nearestCardId = useMemo(() => {
    if (!filteredCards.length) return "";

    let nearestCard = filteredCards[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const card of filteredCards) {
      const position = canvasPositions.get(card.id) ?? card.world;
      const { width, height } = cardDimensions(card, baseWidth, position.scale);
      const centerX = offset.x + (position.x + width / 2) * zoom;
      const centerY = offset.y + (position.y + height / 2) * zoom;
      const distance = (centerX - layoutWidth / 2) ** 2 + (centerY - layoutHeight / 2) ** 2;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCard = card;
      }
    }

    return nearestCard.id;
  }, [baseWidth, canvasPositions, filteredCards, layoutHeight, layoutWidth, offset.x, offset.y, zoom]);

  const centerCard = useCallback((card: Card) => {
    const position = canvasPositions.get(card.id) ?? card.world;
    const { width, height } = cardDimensions(card, cardBaseWidth(viewportWidth), position.scale);
    const nextOffset = clampOffset({
      x: viewportWidth / 2 - (position.x + width / 2) * zoom,
      y: viewportHeight / 2 - (position.y + height / 2) * zoom + 10,
    }, viewportWidth, viewportHeight, zoom, worldHeight);
    setOffset((current) => offsetsMatch(current, nextOffset) ? current : nextOffset);
  }, [canvasPositions, viewportHeight, viewportWidth, worldHeight, zoom]);

  const recenterCard = useCallback((card: Card) => {
    centerCard(card);
  }, [centerCard]);

  const focusAdjacentCard = useCallback((direction: -1 | 1) => {
    if (!filteredCards.length) return;
    const currentIndex = filteredCards.findIndex((card) => card.id === nearestCardId);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + filteredCards.length) % filteredCards.length;
    const nextCard = filteredCards[nextIndex];
    recenterCard(nextCard);
    setNavigationAnnouncement(`${nextCard.name} centered.`);
  }, [filteredCards, nearestCardId, recenterCard]);

  const closeSelection = useCallback(() => {
    historyAction.current = "push";
    setSelectedId(null);
  }, []);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observedViewport = viewport;

    function measureViewport() {
      const bounds = observedViewport.getBoundingClientRect();
      const width = bounds.width;
      const height = bounds.height;
      setViewportWidth(width);
      setViewportHeight(height);

      if (!centered.current) {
        const matchesInitialFilter = (card: Card) =>
          initialFilter === "all" || card.filters.includes(initialFilter);
        const initial = cards.find((card) => card.id === initialCardId) ??
          cards.find(matchesInitialFilter) ??
          cards[0];
        if (!initial) {
          centered.current = true;
          return;
        }
        const initialIndex = cards.findIndex((card) => card.id === initial.id);
        const responsiveLayout = buildCashAppCanvasLayout(width, cards.length);
        const initialPosition = responsiveLayout[initialIndex] ?? initial.world;
        const { width: cardWidth, height: cardHeight } = cardDimensions(
          initial,
          cardBaseWidth(width),
          initialPosition.scale,
        );
        const nextOffset = clampOffset({
          x: width / 2 - initialPosition.x - cardWidth / 2,
          y: height / 2 - initialPosition.y - cardHeight / 2 + 10,
        }, width, height, 1, getWorldHeight(cards.length));
        setOffset((current) => offsetsMatch(current, nextOffset) ? current : nextOffset);
        centered.current = true;
      }
    }

    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(observedViewport);
    return () => resizeObserver.disconnect();
  }, [cards, initialCardId, initialFilter]);

  useEffect(() => {
    setOffset((current) => {
      const next = clampOffset(current, viewportWidth, viewportHeight, zoom, worldHeight);
      return offsetsMatch(current, next) ? current : next;
    });
  }, [viewportHeight, viewportWidth, worldHeight, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const activeViewport = viewport;

    function handleWheel(event: WheelEvent) {
      const target = event.target as HTMLElement;
      const isZoomGesture = event.ctrlKey || event.metaKey;

      // Trackpad pinch arrives as a Ctrl/Command wheel gesture. This listener
      // must be explicitly non-passive so the browser's page zoom is cancelled.
      if (isZoomGesture) event.preventDefault();
      if (target.closest('[role="dialog"], .filter-menu, .zoom-controls')) return;

      event.preventDefault();
      if (selectedId) return;

      if (isZoomGesture) {
        const bounds = activeViewport.getBoundingClientRect();
        const delta = Math.max(-0.25, Math.min(0.25, -event.deltaY * 0.002));
        zoomTo(zoom + delta, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      } else {
        moveCanvas(-event.deltaX, -event.deltaY);
      }
    }

    activeViewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => activeViewport.removeEventListener("wheel", handleWheel);
  }, [selectedId, viewportHeight, viewportWidth, worldHeight, zoom]);

  useEffect(() => {
    const nextUrl = buildCardsUrl(activeFilter, selectedId);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === nextUrl) return;

    const method = historyAction.current === "push" ? "pushState" : "replaceState";
    window.history[method](null, "", nextUrl);
    historyAction.current = "replace";
  }, [activeFilter, selectedId]);

  useEffect(() => {
    function restoreFromHistory() {
      const next = readCardsUrl(cards);
      historyAction.current = "replace";
      setActiveFilter(next.filter);
      setSelectedId(next.cardId);
      if (next.cardId) {
        const restoredCard = cards.find((card) => card.id === next.cardId);
        if (restoredCard) recenterCard(restoredCard);
      } else {
        const nextCards = cards.filter(
          (card) => next.filter === "all" || card.filters.includes(next.filter),
        );
        if (!nextCards.some((card) => card.id === nearestCardId) && nextCards[0]) {
          recenterCard(nextCards[0]);
        }
      }
      setFilterOpen(false);
      setNavigationAnnouncement("");
    }

    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, [cards, nearestCardId, recenterCard]);

  useEffect(() => {
    if (!isMounted || !selectedCard) return;

    const focusScope = selectionDialogRef.current;
    if (!focusScope) return;
    const activeFocusScope: HTMLDivElement = focusScope;
    const previous = selectionTriggerRef.current ?? document.activeElement as HTMLElement | null;
    const initialFocus = activeFocusScope.querySelector<HTMLElement>("[data-dialog-autofocus]") ?? activeFocusScope;
    initialFocus.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSelection();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        activeFocusScope.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        activeFocusScope.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (activeElement === activeFocusScope || !activeFocusScope.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
      else viewportRef.current?.focus();
      selectionTriggerRef.current = null;
    };
  }, [closeSelection, isMounted, selectedCard]);

  function moveCanvas(dx: number, dy: number) {
    setOffset((current) => {
      const next = clampOffset(
        { x: current.x + dx, y: current.y + dy },
        viewportWidth,
        viewportHeight,
        zoom,
        worldHeight,
      );
      return offsetsMatch(current, next) ? current : next;
    });
  }

  function zoomTo(value: number, anchor?: { x: number; y: number }) {
    const nextZoom = clampZoom(value);
    if (Math.abs(nextZoom - zoom) < 0.001) return;

    const zoomAnchor = anchor ?? { x: viewportWidth / 2, y: viewportHeight / 2 };
    const ratio = nextZoom / zoom;
    setOffset((current) => {
      const next = clampOffset({
        x: zoomAnchor.x - (zoomAnchor.x - current.x) * ratio,
        y: zoomAnchor.y - (zoomAnchor.y - current.y) * ratio,
      }, viewportWidth, viewportHeight, nextZoom, worldHeight);
      return offsetsMatch(current, next) ? current : next;
    });
    setZoom(nextZoom);
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (selectedId || !event.isPrimary || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const blockedTarget = target.closest("button:not(.canvas-card), a, [role='dialog'], .card-rotator, .canvas-header, .filter-menu, .empty-state, .zoom-controls");
    if (blockedTarget) return;
    suppressPointerClickUntil.current = 0;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: offset, moved: false };
  }

  function onCanvasPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 6) {
      if (!drag.current.moved) {
        drag.current.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
      }
    }
    if (!drag.current.moved) return;
    setOffset(clampOffset({
      x: drag.current.origin.x + event.clientX - drag.current.x,
      y: drag.current.origin.y + event.clientY - drag.current.y,
    }, viewportWidth, viewportHeight, zoom, worldHeight));
  }

  function endCanvasDrag(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (drag.current.moved) suppressPointerClickUntil.current = performance.now() + 500;
    drag.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectCard(card: Card) {
    historyAction.current = "push";
    setSelectedId(card.id);
    setFilterOpen(false);
    setNavigationAnnouncement("");
  }

  function openCardFromClick(event: ReactMouseEvent<HTMLButtonElement>, card: Card) {
    if (event.detail > 0 && performance.now() < suppressPointerClickUntil.current) {
      event.preventDefault();
      suppressPointerClickUntil.current = 0;
      return;
    }

    selectionTriggerRef.current = event.currentTarget;
    selectCard(card);
  }

  function closeFilterMenuAndRestoreFocus() {
    setFilterOpen(false);
    window.requestAnimationFrame(() => filterButtonRef.current?.focus());
  }

  function applyFilter(filter: CardFilter) {
    closeFilterMenuAndRestoreFocus();
    setNavigationAnnouncement("");
    if (filter === activeFilter) return;

    historyAction.current = "push";
    const nextCards = cards.filter((card) => filter === "all" || card.filters.includes(filter));
    if (!nextCards.some((card) => card.id === nearestCardId) && nextCards[0]) {
      recenterCard(nextCards[0]);
    }
    setActiveFilter(filter);
    if (selectedId) {
      const selected = cards.find((card) => card.id === selectedId);
      if (!selected || (filter !== "all" && !selected.filters.includes(filter))) {
        setSelectedId(null);
      }
    }
  }

  return (
    <main
      className={`canvas${isDragging ? " canvas--dragging" : ""}${selectedCard ? " canvas--selected" : ""}`}
      ref={viewportRef}
      tabIndex={0}
      aria-label="Cardverse card canvas. Drag, scroll, or use arrow keys to move. Use the zoom controls or Control plus scroll to zoom. Use bracket keys for the previous or next card."
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={endCanvasDrag}
      onPointerCancel={() => {
        drag.current = null;
        suppressPointerClickUntil.current = 0;
        setIsDragging(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (selectedCard) closeSelection();
          else if (filterOpen) closeFilterMenuAndRestoreFocus();
          return;
        }
        if (selectedCard) return;
        if (event.target !== event.currentTarget) return;

        if (event.key === "[") {
          event.preventDefault();
          focusAdjacentCard(-1);
        } else if (event.key === "]") {
          event.preventDefault();
          focusAdjacentCard(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveCanvas(72, 0);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          moveCanvas(-72, 0);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveCanvas(0, 72);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          moveCanvas(0, -72);
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          zoomTo(zoom + ZOOM_STEP);
        } else if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          zoomTo(zoom - ZOOM_STEP);
        } else if (event.key === "0") {
          event.preventDefault();
          zoomTo(1);
        }
      }}
    >
      <StarField />

      {isMounted && <div
        className="card-world"
        aria-label={`${filteredCards.length} cards in the current field`}
        aria-hidden={selectedCard ? true : undefined}
        inert={selectedCard ? true : undefined}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          "--world-width": `${WORLD_WIDTH}px`,
          "--world-height": `${worldHeight}px`,
        } as CSSProperties}
      >
        {filteredCards.map((card) => {
          const position = canvasPositions.get(card.id) ?? card.world;
          const { width, height } = cardDimensions(card, baseWidth, position.scale);
          const isFocused = card.id === nearestCardId;
          const style = {
            left: position.x,
            top: position.y,
            width,
            height,
            "--card-opacity": position.depth === "far" ? 0.76 : position.depth === "mid" ? 0.9 : 1,
          } as CSSProperties;

          return (
            <button
              className={`canvas-card${isFocused ? " canvas-card--focused" : ""}`}
              key={card.id}
              style={style}
              type="button"
              tabIndex={isFocused ? 0 : -1}
              aria-label={`Open ${card.name}`}
              onClick={(event) => openCardFromClick(event, card)}
            >
              <span className="canvas-card__art">
                <CardArtwork
                  artworkUrl={card.artworkUrl}
                  orientation={card.artworkOrientation}
                  alt=""
                  sizes="(max-width: 520px) 72vw, 29vw"
                />
              </span>
              {isFocused && (
                <span className="canvas-card__caption">
                  <strong>{card.name}</strong>
                  <span>{card.category} · {card.annualFeeLabel} yearly · Click to observe</span>
                </span>
              )}
            </button>
          );
        })}
      </div>}

      <header
        className="canvas-header"
        aria-hidden={selectedCard ? true : undefined}
        inert={selectedCard ? true : undefined}
      >
        <Brand />
        <div className="canvas-header__actions">
          <span className="count-pill">
            <span>{filteredCards.length}</span>
            <span className="count-label"> cards</span>
          </span>
          <button
            className="filter-button"
            ref={filterButtonRef}
            type="button"
            aria-label={activeFilter === "all" ? "Filter cards" : `Filter cards: ${activeFilterLabel}`}
            aria-expanded={filterOpen}
            aria-controls="filter-menu"
            onClick={() => setFilterOpen((open) => !open)}
          >
            <FilterIcon />
            <span className="filter-button__label">{activeFilterLabel}</span>
            <ChevronIcon className="filter-button__chevron" />
          </button>
        </div>
      </header>

      {filterOpen && (
        <section className="filter-menu" id="filter-menu" aria-label="Filter cards">
          <div className="filter-menu__header">
            <div>
              <span className="eyebrow">Explore by</span>
              <h2>Filter the field</h2>
            </div>
            <span>{filteredCards.length} shown</span>
          </div>
          <div className="filter-options">
            {FILTERS.map((filter) => (
              <button
                className={activeFilter === filter.id ? "filter-option filter-option--active" : "filter-option"}
                key={filter.id}
                type="button"
                aria-pressed={activeFilter === filter.id}
                onClick={() => {
                  applyFilter(filter.id);
                }}
              >
                <span>{filter.label}</span>
                <span>{filter.id === "all" ? cards.length : cards.filter((card) => card.filters.includes(filter.id)).length}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {filteredCards.length === 0 && (
        <section className="empty-state" role="status">
          <span className="eyebrow">Empty field</span>
          <h2>No cards match this filter.</h2>
          <button type="button" onClick={() => applyFilter("all")}>Reset filters</button>
        </section>
      )}

      <div className="canvas-instructions" aria-hidden="true">
        <span className="drag-orb"><GripIcon /></span>
        <span>Drag to explore</span>
      </div>
      <span className="keyboard-cue" aria-hidden="true">Drag · Scroll · Ctrl + scroll to zoom</span>

      <div
        className="zoom-controls"
        aria-label="Canvas zoom controls"
        aria-hidden={selectedCard ? true : undefined}
        inert={selectedCard ? true : undefined}
      >
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomTo(zoom + ZOOM_STEP)}
        >+</button>
        <button
          className="zoom-level"
          type="button"
          aria-label={`Reset zoom. Current zoom ${Math.round(zoom * 100)} percent`}
          onClick={() => zoomTo(1)}
        >{Math.round(zoom * 100)}%</button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomTo(zoom - ZOOM_STEP)}
        >−</button>
      </div>

      {isMounted && selectedCard && (
        <div
          className="selection-dialog"
          ref={selectionDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedCard.name} details`}
          tabIndex={-1}
        >
          <div className="selection-scrim" aria-hidden="true" />
          <div className="selected-card-stage">
            <CardRotator card={selectedCard} />
            <div className="selected-card-name">
              <strong>{selectedCard.name}</strong>
              <span>{selectedCard.category} · {selectedCard.annualFeeLabel} yearly</span>
            </div>
          </div>
          <CardDetailPanel
            card={selectedCard}
            index={cards.findIndex((card) => card.id === selectedCard.id)}
            total={cards.length}
            onClose={closeSelection}
          />
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {selectedCard
          ? `${selectedCard.name} details opened.`
          : `${activeFilterLabel}: ${filteredCards.length} cards shown.`}
      </p>
      <p className="sr-only" aria-live="polite">{navigationAnnouncement}</p>
    </main>
  );
}

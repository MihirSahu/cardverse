"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

import { Brand } from "@/components/brand";
import { ChevronIcon, FilterIcon, GripIcon } from "@/components/icons";
import { StarField } from "@/components/star-field";
import { shouldBypassImageOptimization } from "@/lib/artwork";
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

const TILE_WIDTH = 1520;
const TILE_HEIGHT = 1120;

function buildTileOffsets(viewportSize: number, tileSize: number) {
  const finalTile = Math.max(1, Math.ceil(viewportSize / tileSize));
  return Array.from({ length: finalTile + 2 }, (_, index) => index - 1);
}

function wrap(value: number, size: number) {
  return ((((value + size / 2) % size) + size) % size) - size / 2;
}

function cardBaseWidth(viewportWidth: number) {
  if (viewportWidth <= 520) return Math.min(278, viewportWidth * 0.72);
  return Math.min(380, viewportWidth * 0.29);
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
  const drag = useRef<Drag | null>(null);
  const centered = useRef(false);
  const historyAction = useRef<HistoryAction>("replace");
  const pendingCenterId = useRef<string | null>(null);
  const suppressCardClickUntil = useRef(0);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [activeFilter, setActiveFilter] = useState<CardFilter>(initialFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [focusedId, setFocusedId] = useState(initialCardId ?? "chase-sapphire-preferred");
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
  const normalizedOffset = { x: wrap(offset.x, TILE_WIDTH), y: wrap(offset.y, TILE_HEIGHT) };
  const horizontalTileOffsets = useMemo(
    () => buildTileOffsets(layoutWidth, TILE_WIDTH),
    [layoutWidth],
  );
  const verticalTileOffsets = useMemo(
    () => buildTileOffsets(layoutHeight, TILE_HEIGHT),
    [layoutHeight],
  );
  const interactiveCopies = useMemo(() => {
    const copies = new Map<string, string>();

    for (const card of filteredCards) {
      const width = baseWidth * card.world.scale;
      const height = width / 1.586;
      let nearest = "0:0";
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const tileY of verticalTileOffsets) {
        for (const tileX of horizontalTileOffsets) {
          const centerX = card.world.x + tileX * TILE_WIDTH + normalizedOffset.x + width / 2;
          const centerY = card.world.y + tileY * TILE_HEIGHT + normalizedOffset.y + height / 2;
          const distance = (centerX - layoutWidth / 2) ** 2 + (centerY - layoutHeight / 2) ** 2;

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = `${tileX}:${tileY}`;
          }
        }
      }

      copies.set(card.id, nearest);
    }

    return copies;
  }, [
    baseWidth,
    filteredCards,
    horizontalTileOffsets,
    layoutHeight,
    layoutWidth,
    normalizedOffset.x,
    normalizedOffset.y,
    verticalTileOffsets,
  ]);

  const centerCard = useCallback((card: Card) => {
    const width = cardBaseWidth(viewportWidth) * card.world.scale;
    const height = width / 1.586;
    setOffset({
      x: viewportWidth / 2 - card.world.x - width / 2,
      y: viewportHeight / 2 - card.world.y - height / 2 + 10,
    });
  }, [viewportHeight, viewportWidth]);

  const recenterCard = useCallback((card: Card) => {
    pendingCenterId.current = card.id;
    setFocusedId(card.id);
    centerCard(card);
  }, [centerCard]);

  const focusAdjacentCard = useCallback((direction: -1 | 1) => {
    if (!filteredCards.length) return;
    const currentIndex = filteredCards.findIndex((card) => card.id === focusedId);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + filteredCards.length) % filteredCards.length;
    const nextCard = filteredCards[nextIndex];
    recenterCard(nextCard);
    setNavigationAnnouncement(`${nextCard.name} centered.`);
  }, [filteredCards, focusedId, recenterCard]);

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
        const initial = cards.find((card) => card.id === initialCardId) ??
          cards.find((card) => card.id === "chase-sapphire-preferred") ??
          cards[0];
        if (!initial) {
          centered.current = true;
          return;
        }
        const cardWidth = cardBaseWidth(width) * initial.world.scale;
        const cardHeight = cardWidth / 1.586;
        setOffset({
          x: width / 2 - initial.world.x - cardWidth / 2,
          y: height / 2 - initial.world.y - cardHeight / 2 + 10,
        });
        centered.current = true;
      }
    }

    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(observedViewport);
    return () => resizeObserver.disconnect();
  }, [cards, initialCardId]);

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
      setFilterOpen(false);
      setNavigationAnnouncement("");
    }

    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, [cards]);

  useEffect(() => {
    if (!isMounted || !selectedCard) return;

    const focusScope = selectionDialogRef.current;
    if (!focusScope) return;
    const activeFocusScope: HTMLDivElement = focusScope;
    const previous = document.activeElement as HTMLElement | null;
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
      previous?.focus();
    };
  }, [closeSelection, isMounted, selectedCard]);

  useEffect(() => {
    if (!filteredCards.some((card) => card.id === focusedId)) {
      const replacement = filteredCards[0];
      if (replacement) recenterCard(replacement);
      else setFocusedId("");
    }
  }, [filteredCards, focusedId, recenterCard]);

  useEffect(() => {
    if (selectedCard || !filteredCards.length) return;

    const pendingCard = filteredCards.find((card) => card.id === pendingCenterId.current);
    if (pendingCard) {
      pendingCenterId.current = null;
      setFocusedId(pendingCard.id);
      return;
    }

    let nearestCard = filteredCards[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const card of filteredCards) {
      const width = baseWidth * card.world.scale;
      const height = width / 1.586;
      const copy = interactiveCopies.get(card.id)?.split(":").map(Number) ?? [0, 0];
      const centerX = card.world.x + copy[0] * TILE_WIDTH + normalizedOffset.x + width / 2;
      const centerY = card.world.y + copy[1] * TILE_HEIGHT + normalizedOffset.y + height / 2;
      const distance = (centerX - layoutWidth / 2) ** 2 + (centerY - layoutHeight / 2) ** 2;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCard = card;
      }
    }

    setFocusedId((current) => current === nearestCard.id ? current : nearestCard.id);
  }, [
    baseWidth,
    filteredCards,
    interactiveCopies,
    normalizedOffset.x,
    normalizedOffset.y,
    selectedCard,
    layoutHeight,
    layoutWidth,
  ]);

  function moveCanvas(dx: number, dy: number) {
    setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const cardTarget = target.closest(".canvas-card");
    const blockedTarget = target.closest("a, [role='dialog'], .card-rotator, .canvas-header, .filter-menu, .empty-state");
    if (blockedTarget || (target.closest("button") && !cardTarget)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressCardClickUntil.current = 0;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: offset, moved: false };
    setIsDragging(true);
  }

  function onCanvasPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 6) {
      drag.current.moved = true;
    }
    setOffset({
      x: drag.current.origin.x + event.clientX - drag.current.x,
      y: drag.current.origin.y + event.clientY - drag.current.y,
    });
  }

  function endCanvasDrag(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressCardClickUntil.current = drag.current.moved ? performance.now() + 100 : 0;
    drag.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onWheel(event: ReactWheelEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('[role="dialog"], .filter-menu')) return;
    event.preventDefault();
    moveCanvas(-event.deltaX, -event.deltaY);
  }

  function selectCard(card: Card) {
    historyAction.current = "push";
    setFocusedId(card.id);
    setSelectedId(card.id);
    setFilterOpen(false);
    setNavigationAnnouncement("");
  }

  function shouldSuppressCardClick() {
    if (performance.now() > suppressCardClickUntil.current) return false;
    suppressCardClickUntil.current = 0;
    return true;
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
    if (!nextCards.some((card) => card.id === focusedId) && nextCards[0]) {
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
      aria-label="Cardverse card canvas. Drag, scroll, or use arrow keys to move. Use bracket keys for the previous or next card."
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={endCanvasDrag}
      onPointerCancel={() => {
        suppressCardClickUntil.current = performance.now() + 100;
        drag.current = null;
        setIsDragging(false);
      }}
      onWheel={onWheel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (selectedCard) closeSelection();
          else if (filterOpen) closeFilterMenuAndRestoreFocus();
          return;
        }
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
        }
      }}
    >
      <StarField />

      {isMounted && <div className="card-world" aria-label={`${filteredCards.length} cards in the current field`}>
        {verticalTileOffsets.flatMap((tileY) =>
          horizontalTileOffsets.flatMap((tileX) =>
            filteredCards.map((card) => {
              const width = baseWidth * card.world.scale;
              const height = width / 1.586;
              const left = card.world.x + tileX * TILE_WIDTH + normalizedOffset.x;
              const top = card.world.y + tileY * TILE_HEIGHT + normalizedOffset.y;
              const isFocused = card.id === focusedId;
              const isInteractiveCopy = interactiveCopies.get(card.id) === `${tileX}:${tileY}`;
              const style = {
                left,
                top,
                width,
                height,
                "--card-opacity": card.world.depth === "far" ? 0.76 : card.world.depth === "mid" ? 0.9 : 1,
              } as CSSProperties;

              if (!isInteractiveCopy) {
                return (
                  <div
                    aria-hidden="true"
                    className={`canvas-card${isFocused ? " canvas-card--focused" : ""}`}
                    key={`${card.id}-${tileX}-${tileY}`}
                    onClick={() => {
                      if (shouldSuppressCardClick()) return;
                      selectCard(card);
                    }}
                    style={style}
                  >
                    <span className="canvas-card__art">
                      <Image
                        src={card.artworkUrl}
                        alt=""
                        fill
                        sizes="(max-width: 520px) 72vw, 29vw"
                        draggable={false}
                        unoptimized={shouldBypassImageOptimization(card.artworkUrl)}
                      />
                    </span>
                  </div>
                );
              }

              return (
                <button
                  className={`canvas-card${isFocused ? " canvas-card--focused" : ""}`}
                  key={`${card.id}-${tileX}-${tileY}`}
                  style={style}
                  type="button"
                  aria-label={`Open ${card.name}`}
                  onFocus={() => setFocusedId(card.id)}
                  onClick={() => {
                    if (shouldSuppressCardClick()) return;
                    selectCard(card);
                  }}
                >
                  <span className="canvas-card__art">
                    <Image
                      src={card.artworkUrl}
                      alt=""
                      fill
                      sizes="(max-width: 520px) 72vw, 29vw"
                      draggable={false}
                      unoptimized={shouldBypassImageOptimization(card.artworkUrl)}
                    />
                  </span>
                  {isFocused && isInteractiveCopy && (
                    <span className="canvas-card__caption">
                      <strong>{card.name}</strong>
                      <span>{card.category} · {card.annualFeeLabel} yearly · Click to observe</span>
                    </span>
                  )}
                </button>
              );
            }),
          ),
        )}
      </div>}

      <header className="canvas-header">
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
        <span>Drag any direction</span>
      </div>
      <span className="repeat-cue" aria-hidden="true">Field repeats seamlessly ↻</span>
      <span className="keyboard-cue" aria-hidden="true">Drag · Scroll · Arrows · [ ] cards</span>

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

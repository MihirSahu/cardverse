"use client";

import { useEffect, useRef, useState } from "react";

import { CloseIcon, ExternalIcon } from "@/components/icons";
import type { Card, RewardRate } from "@/lib/types";

type CardDetailPanelProps = {
  card: Card;
  index: number;
  total: number;
  onClose: () => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatRewardCap(rate: RewardRate) {
  if (rate.cap == null) return null;
  const periodLabels: Record<string, string> = { monthly: "month", quarterly: "quarter", annual: "year" };
  const period = rate.capPeriod ? ` per ${periodLabels[rate.capPeriod] ?? rate.capPeriod}` : "";
  return `${rate.label}: bonus rate applies to up to $${rate.cap.toLocaleString()} in eligible spending${period}.`;
}

export function CardDetailPanel({ card, index, total, onClose }: CardDetailPanelProps) {
  const dragStart = useRef<number | null>(null);
  const sheetDragged = useRef(false);
  const sheetOffsetRef = useRef(0);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const rewardCaps = card.rewardRates.map(formatRewardCap).filter((cap): cap is string => Boolean(cap));

  function beginSheetDrag(clientY: number) {
    if (dragStart.current != null) return;
    dragStart.current = clientY;
    sheetDragged.current = false;
  }

  function moveSheetDrag(clientY: number) {
    if (dragStart.current == null) return;
    const delta = clientY - dragStart.current;
    if (Math.abs(delta) > 6) sheetDragged.current = true;
    sheetOffsetRef.current = Math.max(-90, delta);
    setSheetOffset(sheetOffsetRef.current);
  }

  function finishSheetDrag(clientY?: number) {
    if (dragStart.current == null) return;
    const pointerUpOffset = clientY == null || clientY === 0
      ? sheetOffsetRef.current
      : Math.max(-90, clientY - dragStart.current);
    const releaseOffset = Math.abs(sheetOffsetRef.current) > Math.abs(pointerUpOffset)
      ? sheetOffsetRef.current
      : pointerUpOffset;
    if (Math.abs(releaseOffset) > 6) sheetDragged.current = true;

    if (releaseOffset < -55) setSheetExpanded(true);
    else if (releaseOffset > 110) {
      if (sheetExpanded) setSheetExpanded(false);
      else onClose();
    }

    sheetOffsetRef.current = 0;
    setSheetOffset(0);
    dragStart.current = null;
  }

  function cancelSheetDrag() {
    dragStart.current = null;
    sheetDragged.current = false;
    sheetOffsetRef.current = 0;
    setSheetOffset(0);
  }

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      moveSheetDrag(event.clientY);
    }

    function onPointerUp(event: PointerEvent) {
      finishSheetDrag(event.clientY);
    }

    function onMouseMove(event: MouseEvent) {
      moveSheetDrag(event.clientY);
    }

    function onMouseUp(event: MouseEvent) {
      finishSheetDrag(event.clientY);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", cancelSheetDrag);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", cancelSheetDrag);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onClose, sheetExpanded]);

  return (
    <aside
      className={`detail-panel${sheetExpanded ? " detail-panel--expanded" : ""}`}
      aria-labelledby="detail-title"
      style={{ transform: `translateY(${sheetOffset}px)` }}
    >
      <div
        className="sheet-handle-zone"
        role="button"
        tabIndex={0}
        aria-label={sheetExpanded ? "Collapse card details" : "Expand card details"}
        aria-expanded={sheetExpanded}
        onClick={() => {
          if (sheetDragged.current) {
            sheetDragged.current = false;
            return;
          }
          setSheetExpanded((expanded) => !expanded);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setSheetExpanded((expanded) => !expanded);
        }}
        onPointerDown={(event) => {
          beginSheetDrag(event.clientY);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onMouseDown={(event) => beginSheetDrag(event.clientY)}
        onPointerMove={(event) => moveSheetDrag(event.clientY)}
        onMouseMove={(event) => moveSheetDrag(event.clientY)}
        onPointerUp={(event) => {
          finishSheetDrag(event.clientY);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onMouseUp={(event) => finishSheetDrag(event.clientY)}
        onPointerCancel={cancelSheetDrag}
      >
        <span className="sheet-handle" aria-hidden="true" />
      </div>

      <div className="detail-scroll">
        <header className="detail-header">
          <div className="detail-meta-row">
            <span className="eyebrow">Card {String(index + 1).padStart(2, "0")} of {total} · {card.category}</span>
            <button
              className="icon-button icon-button--dark"
              type="button"
              onClick={onClose}
              aria-label="Close card details"
              data-dialog-autofocus
            >
              <CloseIcon />
            </button>
          </div>
          <span className="detail-issuer">{card.issuer}</span>
          <h2 id="detail-title">{card.name}</h2>
          <p className="detail-take">{card.editorialSummary}</p>
          <p className="detail-intro">{card.goodToKnow}</p>
        </header>

        <section className="fact-grid" aria-label="Key facts">
          <div className="fact-cell">
            <span>Annual fee</span>
            <strong>{card.annualFeeLabel}</strong>
          </div>
          <div className="fact-cell">
            <span>Welcome offer</span>
            <strong>{card.welcomeOffer?.amount ?? "See issuer"}</strong>
            {card.welcomeOffer?.requirement && (
              <small className="fact-cell__note">{card.welcomeOffer.requirement}</small>
            )}
          </div>
          <div className="fact-cell">
            <span>Rewards</span>
            <strong className="fact-cell__rewards">{card.rewardSummary}</strong>
            {rewardCaps.slice(0, 2).map((cap) => (
              <small className="fact-cell__note" key={cap}>{cap}</small>
            ))}
          </div>
          <div className="fact-cell">
            <span>Foreign fee</span>
            <strong>{card.foreignTransactionFee}</strong>
          </div>
        </section>

        <section className="education-section">
          <span className="eyebrow">Our take</span>
          <h3>{card.editorialSummary}</h3>
          <p>{card.goodToKnow}</p>
        </section>

        <section className="education-row">
          <div>
            <span>Purchase APR</span>
            <strong>{card.purchaseApr}</strong>
          </div>
          <p>Interest can erase the value of rewards quickly.</p>
        </section>

        <section className="education-section education-section--compact">
          <span>Benefits</span>
          <ul>
            {card.benefits.slice(0, 3).map((benefit) => <li key={benefit}>{benefit}</li>)}
          </ul>
        </section>

        <section className="education-section education-section--compact">
          <span>Application notes</span>
          <ul>
            {card.applicationRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </section>
      </div>

      <footer className="detail-actions">
        <div className="detail-action-row">
          <a className="primary-action" href={card.issuerUrl} target="_blank" rel="noreferrer">
            <span>Visit issuer</span>
            <ExternalIcon />
          </a>
          <a className="secondary-action" href={card.ratesAndFeesUrl} target="_blank" rel="noreferrer">Rates & fees</a>
        </div>
        <div className="detail-source-row">
          <span>
            {card.dataSource === "cardapi" ? "CardAPI facts + editorial context · Updated" : "Editorial data · Reviewed"}{" "}
            {formatDate(card.updatedAt)}
          </span>
          <span>Terms may change</span>
        </div>
      </footer>
    </aside>
  );
}

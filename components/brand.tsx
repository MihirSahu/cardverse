export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">C</span>
      <span className="brand-copy">
        <span className="brand-name">Cardverse</span>
        {!compact && <span className="brand-kicker">Explore the card field</span>}
      </span>
    </div>
  );
}

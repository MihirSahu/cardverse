const dots = Array.from({ length: 72 }, (_, index) => ({
  left: `${(index * 47 + 13) % 101}%`,
  top: `${(index * 71 + 7) % 103}%`,
  size: index % 11 === 0 ? 3 : index % 4 === 0 ? 2 : 1,
  tone: index % 13 === 0 ? "cyan" : "white",
  opacity: 0.32 + ((index * 17) % 46) / 100,
}));

const flares = [
  { left: "13%", top: "28%", size: 22, tone: "white" },
  { left: "74%", top: "8%", size: 16, tone: "cyan" },
  { left: "88%", top: "51%", size: 30, tone: "white" },
  { left: "32%", top: "72%", size: 18, tone: "lime" },
  { left: "54%", top: "22%", size: 13, tone: "white" },
];

export function StarField({ subtle = false }: { subtle?: boolean }) {
  return (
    <div className={`star-field${subtle ? " star-field--subtle" : ""}`} aria-hidden="true">
      {dots.map((dot, index) => (
        <span
          className={`star-dot star-dot--${dot.tone}`}
          key={index}
          style={{
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            opacity: dot.opacity,
          }}
        />
      ))}
      {flares.map((flare, index) => (
        <span
          className={`star-flare star-flare--${flare.tone}`}
          key={index}
          style={{ left: flare.left, top: flare.top, width: flare.size, height: flare.size }}
        />
      ))}
    </div>
  );
}

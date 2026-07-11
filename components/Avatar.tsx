const PALETTE = [
  "bg-pine text-white",
  "bg-clay text-white",
  "bg-[#b4635f] text-white",
  "bg-[#7d94ab] text-white",
  "bg-stone-400 text-white",
];

/** User avatar: photo when available, otherwise a colored initial. */
export function Avatar({
  name,
  image,
  size = 28,
}: {
  name: string | null;
  image?: string | null;
  size?: number;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote avatar hosts aren't configured for next/image
      <img
        src={image}
        alt={name ?? "avatar"}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const hash = [...(name ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0);

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-medium ${PALETTE[hash % PALETTE.length]}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {initial}
    </span>
  );
}

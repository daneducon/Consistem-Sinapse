interface ConsistemLogoProps {
  variant?: "white" | "grafite" | "dark";
  badge?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showSymbolOnly?: boolean;
  className?: string;
}

export default function ConsistemLogo({
  variant = "white",
  badge,
  size = "md",
  showSymbolOnly = false,
  className = "",
}: ConsistemLogoProps) {
  const isGrafite = variant === "grafite" || variant === "dark";

  const imageHeights = {
    sm: "h-7 sm:h-8",
    md: "h-9 sm:h-10",
    lg: "h-12 sm:h-14",
    xl: "h-16 sm:h-20",
  };

  const symbolSizes = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10",
    xl: "w-12 h-12",
  };

  if (showSymbolOnly) {
    return (
      <div className={`inline-flex items-center select-none ${className}`}>
        <img
          src={isGrafite ? "/consistem-symbol.png" : "/consistem-symbol-white.png"}
          alt={badge ? `Consistem ${badge}` : "Consistem"}
          className={`${symbolSizes[size]} object-contain shrink-0`}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center select-none ${className}`}>
      {/* Official Consistem Sinapse horizontal logo. */}
      <img
        src="/logo_grafoconsistem.png"
        alt={badge ? `Consistem ${badge}` : "Consistem"}
        className={`${imageHeights[size]} w-auto object-contain shrink-0 block`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

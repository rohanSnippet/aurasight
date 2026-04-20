const AuraLogo = ({ className = "" }) => (
  <div className={`flex items-center gap-2 font-display ${className}`}>
    <div className="relative h-7 w-7">
      <div className="absolute inset-0 rounded-full bg-gradient-aura blur-md opacity-70 animate-pulse-aura" />
      <div className="absolute inset-1 rounded-full bg-gradient-aura" />
      <div className="absolute inset-[10px] rounded-full bg-background" />
    </div>
    <span className="text-lg font-semibold tracking-tight">
      Aura<span className="text-primary">Sight</span>
    </span>
  </div>
);

export default AuraLogo;
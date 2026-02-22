type VoiceWaveLogoProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

export default function VoiceWaveLogo({
  size = 24,
  className,
  strokeWidth = 3
}: VoiceWaveLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 10v4" stroke="#38BDF8" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7v10" stroke="#38BDF8" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 3v18" stroke="#38BDF8" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v18" stroke="#A3E635" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 7v10" stroke="#A3E635" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 10v4" stroke="#A3E635" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

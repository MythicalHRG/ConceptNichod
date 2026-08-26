import React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export function Logo({ className = "w-8 h-8", ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      {...props}
    >
      <defs>
        <linearGradient id="cn-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5c2e0e" />
          <stop offset="50%" stopColor="#b47525" />
          <stop offset="100%" stopColor="#d4af37" />
        </linearGradient>
        <linearGradient id="cn-grad-2" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.3" />
        </filter>
      </defs>
      <path
        d="M 25 75 C 5 75, 5 25, 25 25 C 45 25, 55 75, 75 75 C 95 75, 95 25, 75 25"
        stroke="url(#cn-grad-1)"
        strokeWidth="16"
        strokeLinecap="round"
        filter="url(#shadow)"
      />
      <path
        d="M 75 75 C 55 75, 45 25, 25 25"
        stroke="url(#cn-grad-2)"
        strokeWidth="16"
        strokeLinecap="round"
        filter="url(#shadow)"
      />
    </svg>
  );
}

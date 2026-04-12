import React from "react";
import { BRAND_BLUE } from "./brandConfig";

export default function BrandIcon({ size = 28, className = "" }) {
  const resolvedSize = Number(size) || 28;
  return (
    <svg
      className={className}
      width={resolvedSize}
      height={resolvedSize}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="24" cy="40" r="16" fill={BRAND_BLUE} />
      <path d="M38 30.5L45 23.5" stroke={BRAND_BLUE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 34V13" stroke={BRAND_BLUE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 37.5L56 27.5" stroke={BRAND_BLUE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="21" r="4.5" fill="white" stroke={BRAND_BLUE} strokeWidth="4" />
      <circle cx="42" cy="9" r="4.5" fill="white" stroke={BRAND_BLUE} strokeWidth="4" />
      <circle cx="58" cy="25" r="4.5" fill="white" stroke={BRAND_BLUE} strokeWidth="4" />
    </svg>
  );
}

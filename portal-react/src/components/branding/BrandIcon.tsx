import React from "react";
import { BRAND_BLUE } from "./brandConfig";

export default function BrandIcon({ size = 28, className = "" }) {
  const resolvedSize = Number(size) || 28;
  return (
    <svg
      className={className}
      width={resolvedSize}
      height={resolvedSize}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="46" cy="82" r="33" fill={BRAND_BLUE} />
      <path d="M74 56L92 74V100" stroke={BRAND_BLUE} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M89 39V93L76 106" stroke={BRAND_BLUE} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M106 31L99 38L99 86L84 101" stroke={BRAND_BLUE} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="74" cy="50" r="10" fill="white" stroke={BRAND_BLUE} strokeWidth="8" />
      <circle cx="89" cy="29" r="10" fill="white" stroke={BRAND_BLUE} strokeWidth="8" />
      <circle cx="108" cy="27" r="10" fill="white" stroke={BRAND_BLUE} strokeWidth="8" />
    </svg>
  );
}

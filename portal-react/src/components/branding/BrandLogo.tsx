import React from "react";
import BrandIcon from "./BrandIcon";
import { PRODUCT_NAME } from "./brandConfig";

const SIZE_MAP = {
  sm: 24,
  md: 30,
  lg: 36
};

export default function BrandLogo({ showText = true, size = "md", className = "" }) {
  const iconSize = SIZE_MAP[size] || SIZE_MAP.md;
  return (
    <div className={`brand-logo brand-logo--${size} ${className}`.trim()}>
      <BrandIcon size={iconSize} className="brand-logo__icon" />
      {showText ? <span className="brand-logo__text">{PRODUCT_NAME}</span> : null}
    </div>
  );
}

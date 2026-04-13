type BrandIconProps = {
  size?: number;
  className?: string;
};

export default function BrandIcon({ size = 28, className = "" }: BrandIconProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}favicon.png`}
      alt="logo"
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        flexShrink: 0
      }}
    />
  );
}
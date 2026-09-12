import "./PricingResourcePill.css";

interface PricingResourcePillProps {
  name: string;
}

export function PricingResourcePill({
  name,
}: PricingResourcePillProps) {
  return (
    <span className="pricing-resource-pill">
      {name}
    </span>
  );
}
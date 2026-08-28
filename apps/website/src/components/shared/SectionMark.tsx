type Props = {
  label: string;
  inverse?: boolean;
  className?: string;
};

/**
 * Chapter identity has exactly one grammar across the whole site: a short
 * accent rule followed by a mono label. No numbering, no per-section
 * variants — variation belongs to the composition inside a section, not to
 * the marker that introduces it.
 */
export function SectionMark({ label, inverse = false, className }: Props) {
  return (
    <div className={`mark ${inverse ? "mark--inverse" : ""} ${className ?? ""}`}>
      <span className="mark__rule" aria-hidden="true" />
      <span className="mark__label">{label}</span>
    </div>
  );
}

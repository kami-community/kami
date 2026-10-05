export interface FoldStep {
  label: string;
  state: "done" | "active" | "todo";
}

/** A short progress trail for multi-step agent work. */
export default function FoldSteps({ steps, label }: { steps: FoldStep[]; label: string }) {
  return (
    <ol className="fold-steps" aria-label={label}>
      {steps.map((s) => (
        <li
          key={s.label}
          data-state={s.state}
          aria-current={s.state === "active" ? "step" : undefined}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}

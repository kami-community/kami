"use client";

export const GOALS = ["Book meetings", "Get signups", "Build awareness", "Raise funding"];
export const STAGES = ["Idea", "Pre-seed", "Seed", "Growth"];

interface GoalChipsProps {
  goals: string[];
  stage: string | null;
  onGoalsChange: (goals: string[]) => void;
  onStageChange: (stage: string | null) => void;
  disabled: boolean;
}

function Chip({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="chip-toggle"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="chip-toggle__mark" aria-hidden="true">
        {selected ? "✓" : "·"}
      </span>
      {label}
    </button>
  );
}

export default function GoalChips({
  goals,
  stage,
  onGoalsChange,
  onStageChange,
  disabled,
}: GoalChipsProps) {
  function toggleGoal(g: string) {
    onGoalsChange(goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g]);
  }

  return (
    <div className="goal-chips">
      <p className="label-caps" id="goal-chips-goals">
        What are you after?
      </p>
      <div className="chip-row goal-chips__row" role="group" aria-labelledby="goal-chips-goals">
        {GOALS.map((g) => (
          <Chip
            key={g}
            label={g}
            selected={goals.includes(g)}
            onClick={() => toggleGoal(g)}
            disabled={disabled}
          />
        ))}
      </div>
      <p className="label-caps" id="goal-chips-stage">
        Your stage
      </p>
      <div className="chip-row goal-chips__row" role="group" aria-labelledby="goal-chips-stage">
        {STAGES.map((s) => (
          <Chip
            key={s}
            label={s}
            selected={stage === s}
            onClick={() => onStageChange(stage === s ? null : s)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

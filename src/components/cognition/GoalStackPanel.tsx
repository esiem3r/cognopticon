import type { CognopticonGoal } from "../../agency/types";

export function GoalStackPanel({ goals }: { goals: CognopticonGoal[] }) {
  return (
    <section>
      <h3>Goals</h3>
      {goals.slice(0, 4).map((goal) => <p key={goal.id}>{goal.title}</p>)}
    </section>
  );
}

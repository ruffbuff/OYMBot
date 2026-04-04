"use client";

import { AgentStep } from "@/types/agent";
import { CheckCircle, Circle, Loader } from "lucide-react";

interface PlanProgressProps {
  steps: AgentStep[];
}

export function PlanProgress({ steps }: PlanProgressProps) {
  // Find the latest planProgress to know total steps
  const planSteps = steps.filter((s) => s.planProgress);
  if (planSteps.length === 0) return null;

  const latest = planSteps[planSteps.length - 1];
  const [currentStr, totalStr] = (latest.planProgress ?? "0/0").split("/");
  const total = parseInt(totalStr, 10);
  const current = parseInt(currentStr, 10);

  if (total === 0) return null;

  // Build step list from steps that have planProgress
  const stepItems: { index: number; description: string; status: "done" | "active" | "pending" }[] = [];
  for (let i = 1; i <= total; i++) {
    const stepData = planSteps.find((s) => {
      const [c] = (s.planProgress ?? "0/0").split("/");
      return parseInt(c, 10) === i;
    });
    const status = i < current ? "done" : i === current ? "active" : "pending";
    stepItems.push({
      index: i,
      description: stepData?.thought ?? `Step ${i}`,
      status,
    });
  }

  return (
    <div className="mx-4 mb-3 p-3 bg-slate-800 border border-slate-600 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-300">Plan Progress</span>
        <span className="text-xs text-slate-400">{current}/{total}</span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 w-full bg-slate-700 rounded-full mb-3">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      {/* Step list */}
      <div className="space-y-1.5">
        {stepItems.map((item) => (
          <div key={item.index} className="flex items-start gap-2">
            {item.status === "done" ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
            ) : item.status === "active" ? (
              <Loader className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0 animate-spin" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-slate-600 mt-0.5 flex-shrink-0" />
            )}
            <span
              className={`text-xs leading-tight ${
                item.status === "done"
                  ? "text-slate-400 line-through"
                  : item.status === "active"
                  ? "text-white"
                  : "text-slate-600"
              }`}
            >
              {item.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

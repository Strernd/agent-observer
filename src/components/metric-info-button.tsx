"use client";

import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MetricDefinition } from "@/lib/report-metric-definitions";

export function MetricInfoButton({
  definition,
}: {
  definition: MetricDefinition;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded border border-gray-400 text-gray-600 transition-colors hover:border-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700/40"
        aria-label={`Explain ${definition.label}`}
      >
        <Info className="size-3" />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {definition.label}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {definition.definition}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <MetricField label="Formula">
            <code className="block rounded-md bg-gray-100 px-3 py-2 font-mono text-[12px] text-gray-1000">
              {definition.formula}
            </code>
          </MetricField>
          <MetricField label="Numerator">
            <p className="text-[13px] text-gray-900">{definition.numerator}</p>
          </MetricField>
          {definition.denominator ? (
            <MetricField label="Denominator">
              <p className="text-[13px] text-gray-900">
                {definition.denominator}
              </p>
            </MetricField>
          ) : null}
          {definition.bucketing ? (
            <MetricField label="Bucketing">
              <p className="text-[13px] text-gray-900">
                {definition.bucketing}
              </p>
            </MetricField>
          ) : null}
          {definition.caveats?.length ? (
            <MetricField label="Caveats">
              <ul className="space-y-1">
                {definition.caveats.map((caveat) => (
                  <li
                    key={caveat}
                    className="text-[12px] leading-relaxed text-gray-800 before:mr-1.5 before:text-gray-500 before:content-['\u2022']"
                  >
                    {caveat}
                  </li>
                ))}
              </ul>
            </MetricField>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-gray-600">
        {label}
      </div>
      {children}
    </div>
  );
}

"use client";

import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export function MultiSelect({
  name,
  options,
  defaultSelected = [],
  placeholder = "Select\u2026",
}: {
  name: string;
  options: MultiSelectOption[];
  defaultSelected?: readonly string[];
  placeholder?: string;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(defaultSelected)
  );
  const [search, setSearch] = React.useState("");

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const clear = () => {
    setSelected(new Set());
  };

  const filtered = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const selectedLabels = options
    .filter((o) => selected.has(o.value))
    .map((o) => o.label);

  return (
    <>
      {/* Hidden inputs for form submission */}
      {Array.from(selected).map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      <Popover>
        <PopoverTrigger
          className="flex h-8 w-full items-center justify-between gap-1.5 rounded-md border border-gray-400 bg-background-100 px-2.5 text-left text-[13px] outline-none transition-colors hover:border-gray-500 focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700/20"
        >
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {selected.size === 0 ? (
              <span className="text-gray-600">{placeholder}</span>
            ) : selected.size <= 2 ? (
              <span className="truncate text-gray-1000">
                {selectedLabels.join(", ")}
              </span>
            ) : (
              <span className="text-gray-1000">
                {selected.size} selected
              </span>
            )}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-gray-600" />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-(--anchor-width) min-w-[200px] max-w-[320px] p-0"
        >
          {/* Search input */}
          {options.length > 6 && (
            <div className="border-b border-gray-300 px-2.5 py-2">
              <input
                type="text"
                placeholder="Search\u2026"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-full rounded-md border border-gray-400 bg-background-100 px-2 text-[12px] text-gray-1000 outline-none placeholder:text-gray-600 focus:border-blue-700 focus:ring-1 focus:ring-blue-700/20"
              />
            </div>
          )}

          {/* Options list */}
          <div className="max-h-[220px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-gray-600">
                No results
              </div>
            ) : (
              filtered.map((option) => {
                const isChecked = selected.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggle(option.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-gray-1000 outline-none transition-colors hover:bg-gray-100 focus-visible:bg-gray-100"
                  >
                    <Checkbox
                      checked={isChecked}
                      tabIndex={-1}
                      className="pointer-events-none"
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {selected.size > 0 && (
            <div className="border-t border-gray-300 px-2.5 py-1.5">
              <button
                type="button"
                onClick={clear}
                className="flex items-center gap-1 text-[12px] text-gray-600 transition-colors hover:text-gray-1000"
              >
                <X className="size-3" />
                Clear all
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export type PickerItem = { id: string; label: string };
export type SearchType = "course" | "club" | "spot" | "interest";

type RawResult = {
  id: string;
  code?: string;
  title?: string;
  titleEn?: string;
  name?: string;
  nameEn?: string;
  labelKo?: string;
  labelEn?: string;
};

function labelOf(item: RawResult, type: SearchType, locale: string): string {
  const en = locale === "en";
  if (type === "course") return `${item.code} — ${(en && item.titleEn) || item.title}`;
  if (type === "interest") return (en ? item.labelEn : item.labelKo) ?? item.labelKo ?? "";
  return (en && item.nameEn) || item.name || "";
}

/**
 * Autocomplete-and-chip picker shared by the courses/clubs/spots/interests wizard
 * steps (B4/B5/B6/B8), backed by the S06 search API. Selected items render as removable
 * chips plus one hidden input per item (`name={hiddenFieldName}`), so the enclosing
 * `<form>` submits them as a plain multi-value field the server action reads with
 * `formData.getAll(...)` — no client-side JSON serialization needed.
 */
export function SearchPicker({
  searchType,
  locale,
  hiddenFieldName,
  selected,
  onChange,
  max,
  placeholder,
}: {
  searchType: SearchType;
  locale: string;
  hiddenFieldName: string;
  selected: PickerItem[];
  onChange: (next: PickerItem[]) => void;
  max: number;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // An empty query fetches the first suggestions, so the list is not blank until the
    // person starts typing.
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ type: searchType, q: query });
      fetch(`/api/reference/search?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data: { results: RawResult[] }) => {
          const selectedIds = new Set(selected.map((s) => s.id));
          setResults(
            data.results
              .filter((r) => !selectedIds.has(r.id))
              .map((r) => ({ id: r.id, label: labelOf(r, searchType, locale) })),
          );
        })
        .catch(() => setResults([]));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `selected` intentionally excluded, only used to filter at fetch time
  }, [query, searchType, locale]);

  const visibleResults = results;
  const atMax = selected.length >= max;

  function add(item: PickerItem) {
    if (atMax || selected.some((s) => s.id === item.id)) return;
    onChange([...selected, item]);
    setResults((prev) => prev.filter((r) => r.id !== item.id));
    setQuery("");
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {selected.map((item) => (
          <Badge key={item.id} variant="secondary" className="h-auto py-1">
            <input type="hidden" name={hiddenFieldName} value={item.id} />
            {item.label}
            <button
              type="button"
              onClick={() => remove(item.id)}
              aria-label={item.label}
              className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ×
            </button>
          </Badge>
        ))}
      </div>

      {!atMax && (
        <div className="relative">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          {visibleResults.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-sm">
              {visibleResults.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

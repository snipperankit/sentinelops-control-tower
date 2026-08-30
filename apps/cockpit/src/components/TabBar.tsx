import { useRef } from "react";
import type { KeyboardEvent } from "react";

export type CockpitTab = "decision" | "evidence" | "audit" | "harness";

export interface TabDefinition {
  readonly id: CockpitTab;
  readonly label: string;
  readonly count?: number;
}

export interface TabBarProps {
  readonly tabs: readonly TabDefinition[];
  readonly active: CockpitTab;
  readonly onChange: (tab: CockpitTab) => void;
}

/** Accessible tablist: arrow-key navigation, `aria-selected`, one active tab panel at a time. */
export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const refs = useRef(new Map<CockpitTab, HTMLButtonElement>());

  function focusAndSelect(tab: CockpitTab) {
    onChange(tab);
    refs.current.get(tab)?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (next) focusAndSelect(next.id);
  }

  return (
    <div className="tabbar" role="tablist" aria-label="Cockpit sections" data-testid="tabbar">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(el) => {
            if (el) refs.current.set(tab.id, el);
          }}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          className={tab.id === active ? "tabbar__tab tabbar__tab--active" : "tabbar__tab"}
          data-testid={`tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tabbar__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

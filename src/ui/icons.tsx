const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function PlusIcon() {
  return (
    <svg {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** The tab bar's icons. They are a little larger and lighter than the rest, since they stand alone. */
const tab = { ...base, width: 24, height: 24, strokeWidth: 1.8 } as const;

/** Today: a sun. */
export function TodayIcon() {
  return (
    <svg {...tab}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </svg>
  );
}

/** Projects: a folder. */
export function ProjectsIcon() {
  return (
    <svg {...tab}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2.2 2.5h7.2A2.5 2.5 0 0 1 21 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z" />
    </svg>
  );
}

/** Inbox: a tray. */
export function InboxIcon() {
  return (
    <svg {...tab}>
      <path d="M3 13.5 5.6 6.3A2 2 0 0 1 7.5 5h9a2 2 0 0 1 1.9 1.3L21 13.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 13.5h5l1.2 2.5h5.6l1.2-2.5h5" />
    </svg>
  );
}

/** Settings: two sliders. */
export function SettingsIcon() {
  return (
    <svg {...tab}>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </svg>
  );
}

/** Points right when its section is folded; CSS turns it down when the section is open. */
export function ChevronIcon() {
  return (
    <svg {...base} width={16} height={16} strokeWidth={2.5}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Sits inside the ring of a routine that is done for the day. */
export function CheckIcon() {
  return (
    <svg {...base} width={14} height={14} strokeWidth={3.5}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Two arrows chasing each other: swap this suggestion for another. */
export function SwapIcon() {
  return (
    <svg {...base}>
      <path d="M4 9a8 8 0 0 1 14-3l2 2" />
      <path d="M20 4v4h-4" />
      <path d="M20 15a8 8 0 0 1-14 3l-2-2" />
      <path d="M4 20v-4h4" />
    </svg>
  );
}

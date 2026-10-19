// Small line icons (24x24, drawn with currentColor) for handles and menus

const svg = (body: string, fill = false) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" ${
    fill
      ? 'fill="currentColor"'
      : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  }>${body}</svg>`;

/** A line icon from its SVG body (column types draw theirs with it) */
export const lineIcon = (body: string): string => svg(body);

// Pushpins by where the needle points
const PIN_POINT_RIGHT = svg('<path d="M21 12h-6M15 8.5v7l-4-1.5H7v-4h4z"/>');
const PIN_POINT_LEFT = svg('<path d="M3 12h6M9 8.5v7l4-1.5h4v-4h-4z"/>');
const PIN_POINT_DOWN = svg('<path d="M12 21v-6M8.5 15h7l-1.5-4V7h-4v4z"/>');
const PIN_POINT_UP = svg('<path d="M12 3v6M8.5 9h7l-1.5 4v4h-4v-4z"/>');

export const ICONS = {
  grip: svg(
    '<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>',
    true,
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  rowAbove: svg('<rect x="3" y="13" width="18" height="7" rx="1"/><path d="M12 3v7M8.5 6.5h7"/>'),
  rowBelow: svg('<rect x="3" y="4" width="18" height="7" rx="1"/><path d="M12 14v7M8.5 17.5h7"/>'),
  columnLeft: svg('<rect x="13" y="3" width="7" height="18" rx="1"/><path d="M3 12h7M6.5 8.5v7"/>'),
  columnRight: svg('<rect x="4" y="3" width="7" height="18" rx="1"/><path d="M14 12h7M17.5 8.5v7"/>'),
  duplicate: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  arrowLeft: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  arrowRight: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  sortAsc: svg('<path d="M7 18V6M3 10l4-4 4 4M14 7h7M14 12h5M14 17h3"/>'),
  sortDesc: svg('<path d="M7 6v12M3 14l4 4 4-4M14 7h3M14 12h5M14 17h7"/>'),
  clear: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  // Sorted lines with a check: make the sorting the real order
  applySort: svg('<path d="M4 6h9M4 12h7M4 18h5M14 15l3 3 5-6"/>'),
  // Two arrows round: calculate again
  recalculate: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>'),
  filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  markdown: svg('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'),
  // A padlock: a name that stays
  fixedName: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  columnType: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  alignLeft: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  alignCenter: svg('<path d="M4 6h16M7 12h10M5.5 18h13"/>'),
  alignRight: svg('<path d="M4 6h16M10 12h10M7 18h13"/>'),
  // A pushpin with its needle pointing to the edge it pins to
  pinTop: PIN_POINT_UP,
  pinBottom: PIN_POINT_DOWN,
  pinLeft: PIN_POINT_LEFT,
  pinRight: PIN_POINT_RIGHT,
} as const;

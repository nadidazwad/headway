import type { Mood } from "../thoughts";

const MOUTHS: Record<Mood, string> = {
  smile: "M8.5 14.5c1.6 2.2 5.4 2.2 7 0",
  grin: "M8 13.6c.6 3.4 7.4 3.4 8 0Z",
  wistful: "M9 15.2c1.8-.9 4.4-.7 6 .2",
  sad: "M8.6 16.2c1.8-2.2 5-2.2 6.8 0",
  tired: "M9 15.2h6",
  worried: "M8.8 15.8c1-1 2-.9 3.2 0s2.2.9 3.2 0",
  love: "M8.5 14.2c1.6 2.6 5.4 2.6 7 0",
  calm: "M9 14.6c1.5 1.2 4.5 1.2 6 0",
  wink: "M9 14.6c1.8 1.6 4.8 1.2 6.2-.4",
  hopeful: "M8.5 14.2c1.6 2.3 5.4 2.3 7 0",
};

const EYES: Record<Mood, string> = {
  smile: '<circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
  grin: '<path d="M7.8 10.3c.6-1 1.8-1 2.4 0M13.8 10.3c.6-1 1.8-1 2.4 0" fill="none"/>',
  wistful: '<path d="M7.6 10.4h2.8M13.6 10.4h2.8" fill="none"/>',
  sad: '<circle cx="9" cy="10.6" r="1"/><circle cx="15" cy="10.6" r="1"/><path d="M7.6 8.6l2.4-.9M16.4 8.6L14 7.7" fill="none"/>',
  tired: '<path d="M7.6 10.6h2.8M13.6 10.6h2.8M7.8 8.8h2.4M13.8 8.8h2.4" fill="none"/>',
  worried: '<circle cx="9" cy="10.4" r="1"/><circle cx="15" cy="10.4" r="1"/><path d="M7.5 8.4l2.6-.8M16.5 8.4l-2.6-.8" fill="none"/>',
  love: '<path d="M9 11.4l-1.5-1.5a1 1 0 0 1 1.5-1.2 1 1 0 0 1 1.5 1.2ZM15 11.4l-1.5-1.5a1 1 0 0 1 1.5-1.2 1 1 0 0 1 1.5 1.2Z"/>',
  calm: '<path d="M7.8 10c.6.8 1.8.8 2.4 0M13.8 10c.6.8 1.8.8 2.4 0" fill="none"/>',
  wink: '<circle cx="9" cy="10" r="1"/><path d="M13.6 10.2h2.8" fill="none"/>',
  hopeful: '<circle cx="9" cy="9.6" r="1"/><circle cx="15" cy="9.6" r="1"/><path d="M7.8 7.6c.6-.5 1.6-.5 2.2-.1M14 7.5c.6-.4 1.6-.4 2.2.1" fill="none"/>',
};

/** The little drawn face in each thought tag. */
export function faceSvg(mood: Mood): string {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.6" fill="none"/>${EYES[mood]}<path d="${MOUTHS[mood]}" fill="${mood === "grin" ? "currentColor" : "none"}"/></svg>`;
}

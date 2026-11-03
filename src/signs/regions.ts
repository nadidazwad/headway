import { STATIONS } from "../line6";

/**
 * Everything printed in the world lives on one atlas. This half is pure layout, shared with the
 * world worker. Atlas UVs are [left, top, right, bottom] with v = 0 at the top row.
 */
export type Uv = readonly [number, number, number, number];

export const ATLAS_SIZE = 2048;

export const SHOP_NAMES = [
  ["মায়ের দোয়া স্টোর", "#c8413a", "#fff7e6"],
  ["ভাই ভাই হোটেল", "#2f8f6b", "#fffbe8"],
  ["রহমান টেইলার্স", "#2f6fb0", "#ffffff"],
  ["আল-আমিন ফার্মেসী", "#f4f1e7", "#1f7a50"],
  ["বিসমিল্লাহ ভাতের হোটেল", "#e2a22d", "#3a1f10"],
  ["নিউ ঢাকা ইলেকট্রনিক্স", "#1f3f7a", "#ffe14d"],
  ["সোনার বাংলা জুয়েলার্স", "#8a1f2d", "#ffd98a"],
  ["জনতা টি স্টল", "#f7d046", "#b0261f"],
  ["মদিনা ক্লথ স্টোর", "#2f8f6b", "#ffe14d"],
  ["আদর্শ লাইব্রেরী", "#f4f1e7", "#26408a"],
  ["ফ্রেন্ডস মোবাইল সেন্টার", "#d4286a", "#ffffff"],
  ["রূপসী বিউটি পার্লার", "#f2a6c4", "#6a123e"],
  ["বিক্রমপুর মিষ্টান্ন ভাণ্ডার", "#fff3c9", "#b0261f"],
  ["শাপলা ডেকোরেটর", "#6d3fa0", "#fff3c9"],
  ["তাজ কনফেকশনারী", "#ff7a2f", "#ffffff"],
  ["হক হার্ডওয়্যার", "#50585c", "#ffe14d"],
  ["পদ্মা ট্রাভেলস", "#1f8fa8", "#ffffff"],
  ["কর্ণফুলী ফার্নিচার", "#6b3f22", "#ffe9c4"],
  ["সেলিম হেয়ার কাটিং", "#2f6fb0", "#ffe14d"],
  ["মোল্লা রেস্তোরাঁ", "#c8413a", "#ffe14d"],
  ["নবাবী কাচ্চি ঘর", "#0f5c3a", "#ffd98a"],
  ["আপন ফটোকপি", "#f7f4ea", "#c8413a"],
  ["গ্রামীণ চা ঘর", "#7a4a26", "#fff3c9"],
  ["বাংলা ল্যাব ডায়াগনস্টিক", "#ffffff", "#1f6fb0"],
] as const;

export const BILLBOARDS = [
  ["ফ্ল্যাট বিক্রয় চলছে", "সহজ কিস্তিতে নিজের ঠিকানা", "#0f5c3a", "#ffffff"],
  ["কোচিংয়ে ভর্তি চলছে", "এইচএসসি · অ্যাডমিশন · ব্যাচ শুরু", "#1f3f7a", "#ffe14d"],
  ["ঢাকা বাণিজ্য মেলা", "সবার জন্য, সারাদিন", "#c8413a", "#ffffff"],
  ["শীতল পানীয়, প্রাণ জুড়ায়", "ঠান্ডা থাকুন ঢাকায়", "#f7b32d", "#3a1f10"],
  ["চা হোক এক কাপ", "গল্প হোক অনেক", "#7a4a26", "#fff3c9"],
  ["নিরাপদ সড়ক চাই", "জীবনের আগে জীবিকা নয়", "#f4f1e7", "#c8413a"],
] as const;

export const POSTERS = [
  ["টু-লেট", "২ রুম · ১ বারান্দা", "#ffffff", "#c8413a"],
  ["ভর্তি চলছে", "ব্যাচ শুরু শনিবার", "#ffe14d", "#1f3f7a"],
  ["বাসা ভাড়া", "গ্যাস · পানি · লিফট", "#f4f1e7", "#0f5c3a"],
  ["পাত্র চাই", "যোগাযোগ করুন", "#f2a6c4", "#6a123e"],
  ["হারানো বিজ্ঞপ্তি", "একটি সাদা বিড়াল", "#ffffff", "#26292b"],
  ["পুরনো বই কিনুন", "নীলক্ষেত মোড়", "#b9d6a0", "#2b4a1c"],
] as const;

const rect = (x: number, y: number, w: number, h: number): Uv => [x / ATLAS_SIZE, y / ATLAS_SIZE, (x + w) / ATLAS_SIZE, (y + h) / ATLAS_SIZE];

export const SHOP_CELL = { w: 512, h: 72 };
export const BOARD_CELL = { w: 1024, h: 96 };
export const BILLBOARD_CELL = { w: 512, h: 170 };
export const POSTER_CELL = { w: 128, h: 170 };

const SHOP_TOP = 4;
const BOARD_TOP = SHOP_TOP + 6 * SHOP_CELL.h + 8;
const BILLBOARD_TOP = BOARD_TOP + 8 * BOARD_CELL.h + 8;
const POSTER_TOP = BILLBOARD_TOP + 2 * BILLBOARD_CELL.h + 8;

export function shopCell(index: number): [number, number] {
  const i = index % SHOP_NAMES.length;
  return [4 + (i % 4) * SHOP_CELL.w, SHOP_TOP + Math.floor(i / 4) * SHOP_CELL.h];
}

export function boardCell(index: number): [number, number] {
  const i = index % STATIONS.length;
  return [4 + (i % 2) * BOARD_CELL.w, BOARD_TOP + Math.floor(i / 2) * BOARD_CELL.h];
}

export function billboardCell(index: number): [number, number] {
  const i = index % BILLBOARDS.length;
  return [4 + (i % 3) * BILLBOARD_CELL.w, BILLBOARD_TOP + Math.floor(i / 3) * BILLBOARD_CELL.h];
}

export function posterCell(index: number): [number, number] {
  const i = index % POSTERS.length;
  return [4 + i * POSTER_CELL.w, POSTER_TOP];
}

export const shopUv = (index: number): Uv => rect(...shopCell(index), SHOP_CELL.w, SHOP_CELL.h);
export const boardUv = (index: number): Uv => rect(...boardCell(index), BOARD_CELL.w, BOARD_CELL.h);
export const billboardUv = (index: number): Uv => rect(...billboardCell(index), BILLBOARD_CELL.w, BILLBOARD_CELL.h);
export const posterUv = (index: number): Uv => rect(...posterCell(index), POSTER_CELL.w, POSTER_CELL.h);

export const stationIndex = (name: string): number => STATIONS.findIndex((station) => station.en === name);

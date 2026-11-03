/**
 * Everything printed in the world lives on one atlas. This half is pure layout, shared with the
 * world worker. Atlas UVs are [left, top, right, bottom] with v = 0 at the top row.
 */
export type Uv = readonly [number, number, number, number];

export const ATLAS_SIZE = 2048;

export type ShopKind =
  | "hotel" | "breakfast" | "shoe" | "grocery" | "clothes" | "pharmacy" | "mobile" | "electronics" | "sweets" | "tailor" | "bank"
  | "coaching" | "clinic" | "parlour" | "gym" | "chinese" | "office";

/**
 * Signboards. Many are parodies of Dhaka's own brands, swapped for a word next door: Shwapno
 * ("dream") becomes a nightmare, Nagad ("cash") becomes credit, Robi ("Sunday") becomes Saturday.
 */
export const SHOP_SIGNS: ReadonlyArray<readonly [ShopKind, string, string]> = [
  ["hotel", "নান্নু মিয়ার বিরিয়ানি", "কাচ্চি · তেহারি · বোরহানি"],
  ["hotel", "হাজী চাচার বিরিয়ানি", "১৯৩৯ সালের আগে থেকে"],
  ["hotel", "কাচ্চি দুলাভাই", "খাসি · মুরগি · ফিরনি"],
  ["hotel", "তারা কাবাব", "শিক · নান · লাচ্ছি"],
  ["hotel", "ফখরু ভাইয়ের বিরিয়ানি", "বিয়েবাড়ির স্বাদ"],
  ["hotel", "সুলতানের ডাইনিং", "খেয়ে দেখুন, বাকি নাই"],
  ["hotel", "কামাল ফ্রাইড চিকেন", "ফিঙ্গার লিকিং কি না জানি না"],
  ["hotel", "পিৎজা কুটির", "ছোট · বড় · ফ্যামিলি"],
  ["hotel", "ভাই ভাই ভাতের হোটেল", "ভাত · মাছ · ডাল · ভর্তা"],
  ["hotel", "মায়ের হাতের রান্না", "ঘরোয়া খাবার"],
  ["hotel", "বিসমিল্লাহ ভাতের হোটেল", "দুপুরের খাবার তৈরি"],
  ["hotel", "খালু হালিম", "গরম গরম, বাটি ভরে"],
  ["breakfast", "সকাল সন্ধ্যা নাস্তা ঘর", "পরোটা · ডাল · ভাজি · ডিম"],
  ["breakfast", "গরম পরোটা হোটেল", "ভোর ৬টা থেকে"],
  ["breakfast", "নিউ আল-মদিনা নাস্তা", "নেহারি · পরোটা · চা"],
  ["breakfast", "জনতা টি স্টল", "দুধ চা · রং চা · বিস্কুট"],
  ["shoe", "বাঁটা শু", "পায়ে পায়ে বাঁটা"],
  ["shoe", "অ্যাপিক্স ফুটওয়্যার", "লেদার · স্যান্ডেল · কেডস"],
  ["shoe", "লাট্টু শু স্টোর", "ঘুরে ঘুরে কিনুন"],
  ["shoe", "উপসাগর এম্পোরিয়াম", "জুতা ও ব্যাগ"],
  ["shoe", "জুতা মহল", "ঈদ কালেকশন এসেছে"],
  ["grocery", "দুঃস্বপ্ন সুপারশপ", "সব আছে, দাম জিজ্ঞেস করবেন না"],
  ["grocery", "টিনা বাজার", "তাজা · সস্তা · কাছেই"],
  ["grocery", "আগরা সুপার শপ", "নিত্য প্রয়োজনীয়"],
  ["grocery", "মায়ের দোয়া স্টোর", "চাল · ডাল · তেল · সাবান"],
  ["grocery", "আলু পটল ডটকম", "এখন দোকানেও"],
  ["clothes", "আড়ংগা", "দেশি পোশাক"],
  ["clothes", "হলুদ ফ্যাশন", "রং একটাই"],
  ["clothes", "ডগস আই", "মেনস ওয়্যার"],
  ["clothes", "নাবিক ফ্যাশন", "পাঞ্জাবি · শার্ট · ফতুয়া"],
  ["clothes", "কঠিন ফ্যাশন", "সহজে পাবেন না"],
  ["clothes", "পুওরম্যান", "রেডিমেড গার্মেন্টস"],
  ["clothes", "মদিনা ক্লথ স্টোর", "শাড়ি · থ্রি-পিস · ওড়না"],
  ["pharmacy", "রেক্ট্যাঙ্গেল ফার্মা", "সব ওষুধ পাওয়া যায়"],
  ["pharmacy", "ল্যাজ ফার্মেসী", "২৪ ঘণ্টা খোলা"],
  ["pharmacy", "আল-আমিন ফার্মেসী", "ডাক্তারের চেম্বার আছে"],
  ["mobile", "গেরামফোন সেন্টার", "সিম · রিচার্জ · সার্ভিসিং"],
  ["mobile", "শনি কাস্টমার কেয়ার", "রবিবার বন্ধ"],
  ["mobile", "বাংলাঠিক পয়েন্ট", "সবই ঠিক আছে"],
  ["mobile", "বাকি এজেন্ট পয়েন্ট", "ক্যাশ ইন · ক্যাশ আউট"],
  ["mobile", "নিকাশ এজেন্ট", "হিসাব নিকাশ এখানে"],
  ["mobile", "ফ্রেন্ডস মোবাইল সেন্টার", "ডিসপ্লে · ব্যাটারি · কভার"],
  ["electronics", "ওয়াটন প্লাজা", "ফ্রিজ · টিভি · এসি"],
  ["electronics", "গায়ক ইলেকট্রনিক্স", "কিস্তিতে পাওয়া যায়"],
  ["electronics", "হাতি ফার্নিচার", "খাট · আলমারি · সোফা"],
  ["electronics", "দেরাজ অনলাইন শপ", "অর্ডার করুন, অপেক্ষা করুন"],
  ["sweets", "জীবনচাঁদ মিষ্টান্ন", "দই · রসগোল্লা · সন্দেশ"],
  ["sweets", "দুর্ভাগ্যকুল মিষ্টি ঘর", "খাঁটি ঘিয়ে তৈরি"],
  ["sweets", "সাধারণ সুইটস", "একদম সাধারণ"],
  ["tailor", "রহমান টেইলার্স", "জেন্টস ও লেডিস"],
  ["tailor", "সেলিম হেয়ার কাটিং", "চুল · দাড়ি · ম্যাসাজ"],
  ["tailor", "আপন ফটোকপি", "প্রিন্ট · লেমিনেটিং · বাইন্ডিং"],
  ["bank", "ডাঁটা-বাংলা ব্যাংক", "এটিএম বুথ"],
  ["bank", "বসুন ধরা সিটি", "ব্যাংক · টিস্যু · সবকিছু"],
  ["coaching", "উদ্ভট কোচিং", "ভর্তি · এইচএসসি · এসএসসি"],
  ["coaching", "কর্নিয়া মেডিকেল কোচিং", "মেডিকেল ভর্তি প্রস্তুতি"],
  ["coaching", "টরমেন্টরস", "ইংলিশ শিখুন কষ্ট করে"],
  ["coaching", "সাইফুল'স ইংলিশ", "স্পোকেন · আইইএলটিএস"],
  ["clinic", "আনপপুলার ডায়াগনস্টিক", "রক্ত · এক্স-রে · অলট্রাসনো"],
  ["clinic", "ব্যান্ড এইড হাসপাতাল", "বিশেষজ্ঞ ডাক্তারের চেম্বার"],
  ["clinic", "ইবনে মিনা ডায়াগনস্টিক", "২৪ ঘণ্টা সেবা"],
  ["clinic", "হাসিমুখ ডেন্টাল", "দাঁত তুলুন হাসিমুখে"],
  ["parlour", "রূপসী বিউটি পার্লার", "শুধুমাত্র মহিলাদের জন্য"],
  ["parlour", "পারসোনা নন গ্রাটা", "হেয়ার · মেকআপ · ব্রাইডাল"],
  ["gym", "নিউ বডি বিল্ডার্স জিম", "সকাল ও সন্ধ্যা ব্যাচ"],
  ["chinese", "নিউ পেকিং রেস্তোরাঁ", "চাইনিজ · থাই · ইন্ডিয়ান"],
  ["chinese", "সাংহাই চাইনিজ", "ফ্যামিলি কেবিন আছে"],
  ["office", "পদ্মা ট্রাভেলস", "হজ্জ · ওমরাহ · এয়ার টিকেট"],
  ["office", "আইটি বাংলা ট্রেনিং", "কম্পিউটার কোর্সে ভর্তি চলছে"],
  ["office", "লেডিস টেইলার্স", "ব্লাউজ · থ্রি-পিস · বোরকা"],
];

const SIGNS_BY_KIND = new Map<ShopKind, number[]>();
SHOP_SIGNS.forEach(([kind], index) => {
  const list = SIGNS_BY_KIND.get(kind);
  if (list) list.push(index);
  else SIGNS_BY_KIND.set(kind, [index]);
});

/** Any sign of this kind, chosen by a number from the caller's random source in [0, 1). */
export function signOf(kind: ShopKind, roll: number): number {
  const list = SIGNS_BY_KIND.get(kind)!;
  return list[Math.floor(roll * list.length)]!;
}

export const BILLBOARDS = [
  ["ফ্ল্যাট বিক্রয় চলছে", "সহজ কিস্তিতে নিজের ঠিকানা", "#1b1c1e", "#ffffff"],
  ["উদ্ভট কোচিংয়ে ভর্তি চলছে", "ভর্তি হতে ভর্তি পরীক্ষা নাই", "#f4f3ec", "#17181a"],
  ["শনি ৪.৫জি", "নেটওয়ার্ক শনির দশা কাটিয়ে", "#2b2c2e", "#ffffff"],
  ["শীতল পানীয়, প্রান্তিক জুস", "ঠান্ডা থাকুন ঢাকায়", "#e8e6dc", "#17181a"],
  ["চা হোক এক কাপ", "গল্প হোক অনেক", "#3b3c3e", "#f6f4ea"],
  ["নিরাপদ সড়ক চাই", "জীবনের আগে জীবিকা নয়", "#f4f1e7", "#17181a"],
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
export const BILLBOARD_CELL = { w: 512, h: 170 };
export const POSTER_CELL = { w: 128, h: 170 };

const SHOP_TOP = 4;
const BILLBOARD_TOP = SHOP_TOP + 18 * SHOP_CELL.h + 8;
const POSTER_TOP = BILLBOARD_TOP + 2 * BILLBOARD_CELL.h + 8;

export function shopCell(index: number): [number, number] {
  const i = index % SHOP_SIGNS.length;
  return [4 + (i % 4) * SHOP_CELL.w, SHOP_TOP + Math.floor(i / 4) * SHOP_CELL.h];
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
export const billboardUv = (index: number): Uv => rect(...billboardCell(index), BILLBOARD_CELL.w, BILLBOARD_CELL.h);
export const posterUv = (index: number): Uv => rect(...posterCell(index), POSTER_CELL.w, POSTER_CELL.h);

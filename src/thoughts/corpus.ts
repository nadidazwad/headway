import said from "./said.json";

export type Mood = "smile" | "grin" | "wistful" | "sad" | "tired" | "worried" | "love" | "calm" | "wink" | "hopeful";

/** What one real person said, in their own Bangla. `en` is our translation; `source` is where it was reported. */
export interface Thought {
  bn: string;
  en: string;
  mood: Mood;
  female: boolean;
  source: string;
}

export type Theme = "women" | "jam" | "bazar" | "kaj" | "bari" | "gorom";

export const THEME_TITLES: Record<Theme | "cab", { bn: string; en: string }> = {
  cab: { bn: "চালকের কেবিন", en: "OPERATOR'S CABIN" },
  women: { bn: "মহিলা কোচ", en: "THE WOMEN'S COACH" },
  jam: { bn: "যানজট", en: "THE JAM" },
  bazar: { bn: "বাজার", en: "THE BAZAAR" },
  kaj: { bn: "রুটিরুজি", en: "MAKING A LIVING" },
  bari: { bn: "বাড়ি ফেরা", en: "GOING HOME" },
  gorom: { bn: "গরম আর বৃষ্টি", en: "HEAT AND RAIN" },
};

type Said = Thought & { theme: Theme | "cab" };
const SAID = said as Said[];

/**
 * Words people really said, as Bangladeshi newspapers reported them, kept to who said them: a woman
 * only ever thinks what a woman said. Run tools/dev/verify-thoughts.mjs to check them against their sources.
 */
export function thoughtsOf(theme: Theme | "cab", female: boolean): readonly Thought[] {
  return SAID.filter((line) => line.theme === theme && line.female === female);
}

export const NAMES_F = [
  ["নুসরাত", "NUSRAT"], ["মিতু", "MITU"], ["জান্নাত", "JANNAT"], ["রুমানা", "RUMANA"], ["লামিয়া", "LAMIA"], ["ফারজানা", "FARZANA"],
  ["তিথি", "TITHI"], ["সাদিয়া", "SADIA"], ["সালমা", "SALMA"], ["পপি", "POPY"], ["শিউলি", "SHIULI"], ["রেহানা", "REHANA"],
] as const;

export const NAMES_M = [
  ["রাফি", "RAFI"], ["তানভীর", "TANVIR"], ["শুভ", "SHUVO"], ["আরিফ", "ARIF"], ["সাব্বির", "SABBIR"], ["হাসান", "HASAN"],
  ["ইমরান", "IMRAN"], ["মাহিন", "MAHIN"], ["রহিম", "RAHIM"], ["জসিম", "JOSHIM"], ["কামাল", "KAMAL"], ["সজীব", "SAJIB"],
] as const;

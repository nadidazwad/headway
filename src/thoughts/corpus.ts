export type Mood = "smile" | "grin" | "wistful" | "sad" | "tired" | "worried" | "love" | "calm" | "wink" | "hopeful";

export interface Thought {
  bn: string;
  en: string;
  mood: Mood;
}

export type Theme = "memory" | "present" | "future" | "home" | "city" | "women";

export const THEME_TITLES: Record<Theme | "cab", { bn: string; en: string }> = {
  cab: { bn: "চালকের কেবিন", en: "OPERATOR'S CABIN" },
  memory: { bn: "স্মৃতির কোচ", en: "PAST THOUGHTS" },
  present: { bn: "এই মুহূর্তের কোচ", en: "PRESENT THOUGHTS" },
  future: { bn: "আগামীর কোচ", en: "FUTURE THOUGHTS" },
  home: { bn: "বাড়ির কোচ", en: "THOUGHTS OF HOME" },
  city: { bn: "শহরের কোচ", en: "THOUGHTS OF THE CITY" },
  women: { bn: "মহিলা কোচ", en: "THE WOMEN'S COACH" },
};

export const OPERATOR_THOUGHTS: readonly Thought[] = [
  { bn: "ছয় কোচে কত মানুষের কত ভাবনা। আমি শুধু সময়মতো পৌঁছে দিই।", en: "Six coaches of other people's thoughts. I just get them there on time.", mood: "calm" },
  { bn: "উত্তরা থেকে মতিঝিল, ঢাকাকে রোজ একবার পড়ি।", en: "Uttara to Motijheel. I read Dhaka end to end every day.", mood: "smile" },
  { bn: "সবুজ সিগন্যাল মানে আরেকটা সকাল ঠিকঠাক।", en: "A green signal means another morning going right.", mood: "wink" },
];

export const THOUGHTS: Record<Theme, readonly Thought[]> = {
  memory: [
    { bn: "বাবার কাঁধে চড়ে প্রথম বাণিজ্য মেলায় গিয়েছিলাম।", en: "I first went to the trade fair on my father's shoulders.", mood: "wistful" },
    { bn: "এই রাস্তায় একসময় রিকশায় প্রেম করেছি।", en: "I once fell in love in a rickshaw on this very road.", mood: "love" },
    { bn: "আগে মিরপুর থেকে মতিঝিল মানে অর্ধেক দিন শেষ।", en: "Mirpur to Motijheel used to cost half a day.", mood: "tired" },
    { bn: "মায়ের হাতের ভাপা পিঠার গন্ধ এখনো মনে আছে।", en: "I can still smell Ma's winter pitha.", mood: "wistful" },
    { bn: "ঢাকায় প্রথম এসেছিলাম একটা টিনের ট্রাঙ্ক নিয়ে।", en: "I came to Dhaka with one tin trunk.", mood: "calm" },
    { bn: "স্কুল পালিয়ে এই মাঠে ক্রিকেট খেলতাম।", en: "We skipped school to play cricket on this field.", mood: "grin" },
    { bn: "দাদু বলতেন, এখানে একদিন ট্রেন চলবে। কেউ বিশ্বাস করেনি।", en: "Grandpa said a train would run here one day. Nobody believed him.", mood: "wistful" },
    { bn: "বর্ষায় ফার্মগেটে হাঁটুজল ভেঙে অফিস গেছি।", en: "I waded knee-deep through Farmgate to reach work in the monsoon.", mood: "tired" },
    { bn: "নিজের টাকায় প্রথম ঈদের জামা কিনেছিলাম নিউমার্কেটে।", en: "I bought my first Eid clothes with my own money at New Market.", mood: "smile" },
    { bn: "টিএসসিতে এক কাপ চায়ে পুরো বিকেল কেটে যেত।", en: "One cup of tea at TSC could last a whole afternoon.", mood: "wistful" },
  ],
  present: [
    { bn: "এই গানটা শেষ না হলে নামব না।", en: "I won't get off until this song ends.", mood: "grin" },
    { bn: "এসির বাতাসটা আজ একটু বেশিই আরাম।", en: "The AC feels especially kind today.", mood: "calm" },
    { bn: "জানালা দিয়ে শহরটা আজ সুন্দর লাগছে।", en: "The city looks lovely through this window today.", mood: "smile" },
    { bn: "আজ জ্যাম নেই, ভাবতেই অবাক লাগে।", en: "No traffic jam today. It still amazes me.", mood: "grin" },
    { bn: "র‍্যাপিড পাসে টাকা আছে তো?", en: "Is there money left on my Rapid Pass?", mood: "worried" },
    { bn: "দাঁড়িয়ে আছি, তবু ঘুম পাচ্ছে।", en: "I'm standing and still falling asleep.", mood: "tired" },
    { bn: "চুপচাপ এই দশ মিনিটই আমার নিজের সময়।", en: "These quiet ten minutes are all mine.", mood: "calm" },
    { bn: "মিটিংটা না হয় পাঁচ মিনিট দেরিতেই শুরু হোক।", en: "Let the meeting start five minutes late.", mood: "wink" },
    { bn: "ফোনে চার্জ আছে দুই পার্সেন্ট। ব্যস, এটুকুই জীবন।", en: "Two percent battery. That's all of life right now.", mood: "worried" },
    { bn: "নিচে রিকশার ঘণ্টা শোনা যায় না, অদ্ভুত।", en: "You can't hear the rickshaw bells from up here. Strange.", mood: "calm" },
  ],
  future: [
    { bn: "আগামী বছর নিজের একটা দোকান দেব।", en: "Next year, my own shop.", mood: "hopeful" },
    { bn: "মেয়েটা ডাক্তার হবে, আমি জানি।", en: "My daughter will be a doctor. I just know it.", mood: "hopeful" },
    { bn: "বিসিএসটা এবার হবেই।", en: "This time I'll clear the BCS.", mood: "grin" },
    { bn: "একদিন এই ট্রেনটা আমিই চালাব।", en: "One day I'll be driving this train.", mood: "hopeful" },
    { bn: "আর দুই বছর, তারপর গ্রামে ফিরে মাছের ঘের।", en: "Two more years, then back to the village and a fish farm.", mood: "calm" },
    { bn: "বিদেশে পড়তে যাব, কিন্তু ফিরব, কথা দিলাম।", en: "I'll study abroad, but I'll come back. I promise.", mood: "hopeful" },
    { bn: "ফ্ল্যাটের কিস্তি শেষ হলে মাকে হজে পাঠাব।", en: "When the flat is paid off, I'll send Ma on Hajj.", mood: "smile" },
    { bn: "আমার অ্যাপটা একদিন সবাই ব্যবহার করবে।", en: "One day everyone will use my app.", mood: "wink" },
    { bn: "ট্রেন একদিন টঙ্গী পর্যন্ত যাবে, তখন বাড়ি কাছে হবে।", en: "One day the train will reach Tongi, and home will be closer.", mood: "hopeful" },
    { bn: "কাল থেকে সত্যিই সকালে হাঁটব।", en: "From tomorrow I'll really start morning walks.", mood: "wink" },
  ],
  home: [
    { bn: "মা নিশ্চয়ই এখন ভাত বেড়ে বসে আছে।", en: "Ma must be sitting with the rice served by now.", mood: "wistful" },
    { bn: "বরিশালের লঞ্চঘাট খুব মনে পড়ে।", en: "I miss the launch ghat in Barishal so much.", mood: "sad" },
    { bn: "ছোট্ট মেয়েটা জিজ্ঞেস করে, বাবা কবে আসবে।", en: "My little girl keeps asking when Baba's coming.", mood: "sad" },
    { bn: "ঈদের টিকিট এবার আগে কাটতেই হবে।", en: "This Eid I must buy the tickets early.", mood: "worried" },
    { bn: "বাড়ি মানে উঠোনের আমগাছটা।", en: "Home means the mango tree in the yard.", mood: "wistful" },
    { bn: "আজ রান্না করব না। ডিম ভাজি আর ভাত।", en: "No cooking tonight. Fried egg and rice.", mood: "tired" },
    { bn: "বাবার ওষুধটা নিতে ভুলে না যাই।", en: "Mustn't forget Baba's medicine.", mood: "worried" },
    { bn: "ভাড়া বাসাটাই এখন বাড়ি, মানতে সময় লাগল।", en: "This rented flat is home now. That took time to accept.", mood: "calm" },
    { bn: "সিলেটের বৃষ্টির শব্দ এখানে নেই।", en: "The rain here doesn't sound like Sylhet's.", mood: "sad" },
  ],
  city: [
    { bn: "ঢাকা ক্লান্ত করে, তবু ছাড়া যায় না।", en: "Dhaka wears you out, and still you can't leave.", mood: "tired" },
    { bn: "উপর থেকে জ্যামটা দেখতে নদীর মতো।", en: "From up here the traffic looks like a river.", mood: "calm" },
    { bn: "এত মানুষ, তবু কেউ কাউকে চেনে না।", en: "So many people, and no one knows anyone.", mood: "sad" },
    { bn: "এই শহরে বৃষ্টি মানেই গল্প।", en: "In this city, rain always means a story.", mood: "smile" },
    { bn: "কৃষ্ণচূড়াটা এবারও ফুটেছে, কেউ খেয়াল করল?", en: "The krishnachura bloomed again. Did anyone notice?", mood: "wistful" },
    { bn: "ছাদে ছাদে কাপড়, ঘরে ঘরে গল্প।", en: "Washing on every roof, a story in every home.", mood: "smile" },
    { bn: "সবাই ব্যস্ত, কিন্তু কোথায় যাচ্ছি সবাই?", en: "Everyone's busy, but where are we all going?", mood: "worried" },
    { bn: "তারের জঙ্গলটাও এখন ভালো লাগে।", en: "Even the jungle of wires looks nice to me now.", mood: "grin" },
    { bn: "এই শহর আমাকে বড় করেছে, একটু কঠিনও।", en: "This city raised me, and made me a little harder too.", mood: "calm" },
  ],
  women: [
    { bn: "আজ কেউ ধাক্কা দেয়নি। এটুকুই অনেক।", en: "Nobody shoved me today. That alone is a lot.", mood: "calm" },
    { bn: "সন্ধ্যায়ও এখন একা বাড়ি ফিরতে পারি।", en: "Now I can get home alone, even after dark.", mood: "smile" },
    { bn: "বোনকে বলব, এই কোচেই উঠিস।", en: "I'll tell my sister: take this coach.", mood: "wink" },
    { bn: "অফিস, বাচ্চা, রান্না। এই বিশ মিনিট শুধু আমার।", en: "Office, kid, cooking. These twenty minutes are mine alone.", mood: "calm" },
    { bn: "প্রথম মাসের বেতনটা আজ হাতে এসেছে।", en: "My first salary came today.", mood: "grin" },
    { bn: "হিজাব ঠিক করতে আয়না লাগে না, জানালাই যথেষ্ট।", en: "The window works as a mirror for my hijab.", mood: "smile" },
    { bn: "মা বলেছিল, মেয়েরা একা পারবে না। মা, দেখো।", en: "Ma said girls couldn't manage alone. Look, Ma.", mood: "hopeful" },
    { bn: "লম্বা শিফটের পর ট্রেনটা পেলে স্বস্তি লাগে।", en: "Catching the train after a long shift is such a relief.", mood: "tired" },
    { bn: "আমার মেয়েও একদিন এই ট্রেন চালাবে।", en: "My daughter will drive this train one day.", mood: "hopeful" },
  ],
};

export const NAMES_F = [
  ["নুসরাত", "NUSRAT"], ["মিতু", "MITU"], ["জান্নাত", "JANNAT"], ["রুমানা", "RUMANA"], ["লামিয়া", "LAMIA"], ["ফারজানা", "FARZANA"],
  ["তিথি", "TITHI"], ["সাদিয়া", "SADIA"], ["সালমা", "SALMA"], ["পপি", "POPY"], ["শিউলি", "SHIULI"], ["রেহানা", "REHANA"],
] as const;

export const NAMES_M = [
  ["রাফি", "RAFI"], ["তানভীর", "TANVIR"], ["শুভ", "SHUVO"], ["আরিফ", "ARIF"], ["সাব্বির", "SABBIR"], ["হাসান", "HASAN"],
  ["ইমরান", "IMRAN"], ["মাহিন", "MAHIN"], ["রহিম", "RAHIM"], ["জসিম", "JOSHIM"], ["কামাল", "KAMAL"], ["সজীব", "SAJIB"],
] as const;

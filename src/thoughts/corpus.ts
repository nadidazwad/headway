export type Mood = "smile" | "grin" | "wistful" | "sad" | "tired" | "worried" | "love" | "calm" | "wink" | "hopeful";

/**
 * Who a line can cross the mind of, going by how they are riding: nobody on a seat wishes for one,
 * and nobody wearing headphones has forgotten them.
 */
export type Fits = "any" | "seated" | "standing" | "strap" | "phone" | "music" | "nomusic";

export interface Thought {
  bn: string;
  en: string;
  mood: Mood;
  female: boolean;
  fits: Fits;
}

export type Theme = "women" | "crush" | "seat" | "sleep" | "late" | "first";

export const THEME_TITLES: Record<Theme | "cab", { bn: string; en: string }> = {
  cab: { bn: "একমাত্র নিশ্চিত সিট", en: "THE ONE GUARANTEED SEAT" },
  // Women only, and it says so nowhere on screen: the name is about the elbows, not who is missing.
  women: { bn: "কনুইমুক্ত এলাকা", en: "ELBOW-FREE ZONE" },
  crush: { bn: "তিল ধারণের ঠাঁই নেই", en: "NO ROOM FOR A SESAME SEED" },
  seat: { bn: "সিট দখল আন্দোলন", en: "THE SEAT-GRABBING MOVEMENT" },
  sleep: { bn: "ঘুম মন্ত্রণালয়", en: "MINISTRY OF SLEEP" },
  late: { bn: "এই তো, চলে আসছি", en: "ALMOST THERE, I SWEAR" },
  first: { bn: "পুরাই সিঙ্গাপুর", en: "BASICALLY SINGAPORE" },
};

type Line = readonly [bn: string, en: string, mood: Mood, fits?: Fits];

/**
 * What crosses a mind on this train, right now, and nowhere else: the smell of the man beside you,
 * the seat about to come free, the nap you should not take. Small and everyday, in the way Dhaka
 * talks to itself, and never a thought about life. Women's and men's lines are kept apart.
 */
const LINES: Record<Theme | "cab", { women: readonly Line[]; men: readonly Line[] }> = {
  women: {
    men: [],
    women: [
      ["এই আপুটা আমার কাঁধে মাথা রেখে ঘুমায় গেছে। এখন কী করি?", "This apu has fallen asleep on my shoulder. Now what?", "grin", "seated"],
      ["সিট পাইছি, আজকে আমার কপাল ভালো।", "Got a seat. Lucky me today.", "smile", "seated"],
      ["সামনের আন্টি এমনভাবে তাকাই আছে, সিট ছেড়ে দিব নাকি?", "The aunty in front keeps staring. Should I give up my seat?", "worried", "seated"],
      ["ব্যাগটা কোলে নিলে আরেকজন বসতে পারবে।", "If I put my bag on my lap someone else can sit.", "calm", "seated"],
      ["অফিসের আগে একটু চোখ বন্ধ করি।", "Let me shut my eyes a bit before office.", "calm", "seated"],
      ["রিংটা এত উঁচুতে কেন? হাত তো পৌঁছায় না।", "Why are the rings so high? I can barely reach.", "tired", "strap"],
      ["কেউ আমার ওড়নার উপর পা দিয়ে দাঁড়ায় আছে।", "Someone is standing on my orna.", "worried", "standing"],
      ["আমার পিছনের আপু ধাক্কা দিয়েই যাইতেছে।", "The apu behind me keeps pushing.", "tired", "standing"],
      ["হিলটা আজকে না পরলেই হইতো।", "Should not have worn heels today.", "tired", "standing"],
      ["মিরপুর ১০-এ তো পুরা কোচ নামবে, তখন বসব।", "The whole coach gets off at Mirpur 10. I'll sit then.", "hopeful", "standing"],
      ["আজকে এত ভিড় কেন? মহিলা কোচেও দাঁড়ানোর জায়গা নাই।", "Why so full today? No room to stand even here.", "tired", "standing"],
      ["মহিলা কোচে উঠে একটু হাঁফ ছাড়লাম।", "On the women's coach at last. I can breathe.", "calm"],
      ["ওই ছেলেটা কি ভুল করে মহিলা কোচে উঠছে, নাকি ইচ্ছা করে?", "Did that boy get on the women's coach by mistake, or on purpose?", "worried"],
      ["স্টেশনে আসতে আসতে মেকআপ সব গলে গেছে।", "Walking to the station melted all my makeup.", "tired"],
      ["আম্মু এই নিয়ে তিনবার ফোন দিল।", "That's the third call from Ammu.", "tired", "phone"],
      ["পাশের আপুর শাড়িটা সুন্দর, কোথা থেকে নিছে জিজ্ঞেস করব?", "Nice saree on the apu next to me. Should I ask where she got it?", "smile"],
      ["পাশের বাচ্চাটা আমার দিকে তাকায় হাসতেছে।", "The baby next to me keeps smiling at me.", "love"],
      ["হিজাবের পিনটা খুলে গেছে মনে হয়।", "I think my hijab pin has come loose.", "worried"],
      ["ব্যাগের ভেতর টিফিন বক্সটা লিক করতেছে না তো?", "Is my tiffin box leaking in my bag?", "worried"],
      ["এই রিলটা দেখতে দেখতে স্টেশন পার হয়ে যাবে।", "This reel is going to make me miss my station.", "grin", "phone"],
    ],
  },
  crush: {
    men: [
      ["এই পাশের লোকটার গায়ের থেকে গন্ধ আসতেছে, একটু দূরে যেয়ে দাঁড়াই।", "This guy next to me smells. Let me go stand a bit further off.", "tired", "standing"],
      ["এত ভিড়ে রিং ধরার দরকারই নাই, পড়ার জায়গাও নাই।", "No need to hold a ring in this crowd. There's no room to fall.", "grin", "standing"],
      ["ভাই, আপনার ব্যাগটা আমার পেটের ভিতর ঢুকে যাইতেছে।", "Brother, your backpack is going into my stomach.", "tired", "standing"],
      ["দরজার সামনে না দাঁড়ালে আজকে আর নামতে পারব না।", "If I don't get to the door now, I'll never get off.", "worried", "standing"],
      ["কেউ আমার জুতার উপর দাঁড়ায় আছে। নতুন জুতা।", "Someone is standing on my shoe. New shoes.", "sad", "standing"],
      ["কারওয়ান বাজারে নামতে হবে, ধাক্কা না দিলে কেউ সরবে না।", "I get off at Karwan Bazar. Nobody moves unless you push.", "worried", "standing"],
      ["পিছনের লোকটা ফোনটা আমার কাঁধে রেখে দেখতেছে।", "The man behind me is resting his phone on my shoulder.", "tired", "standing"],
      ["এই ভিড়ে কারো হাত আমার পকেটে না ঢুকলেই হয়।", "As long as no hand ends up in my pocket.", "worried", "standing"],
      ["সিটে বসে আছি, সামনে এত মানুষ, স্টেশন দেখব কেমনে?", "I've got a seat, but with this crowd how do I see the station?", "worried", "seated"],
      ["বসে আছি, আর কার জানি ব্যাগ মুখে এসে লাগতেছে।", "I'm sitting down and someone's bag keeps hitting my face.", "tired", "seated"],
      ["সামনের ভাই ডিওডোরেন্ট পুরা বোতল মাখায় আসছে।", "The guy in front has put on the whole can of deodorant.", "grin"],
      ["ফুল ভলিউমে রিল দেখে কে? পুরা কোচ শুনতেছে।", "Who watches reels at full volume? The whole coach can hear.", "tired"],
      ["আংকেল এত জোরে ফোনে কথা কইতেছে, উনার বাসার সব জানা হয়ে গেল।", "Uncle is so loud on the phone, I now know all his family business.", "grin"],
      ["এসি চলতেছে তো? ঘাম থামে না কেন?", "Is the AC on? Why won't the sweat stop?", "tired"],
      ["হেডফোনে গান চলতেছে, কারো কথা শোনা লাগতেছে না। শান্তি।", "Music on. Don't have to hear anyone. Peace.", "calm", "music"],
    ],
    women: [
      ["এই লোকটা এত গা ঘেঁষে দাঁড়াইছে কেন? একটু সরি।", "Why is this man standing so close? Let me move.", "worried", "standing"],
      ["ওড়নাটা কার ব্যাগের সাথে জানি আটকে গেছে।", "My orna has caught on someone's bag.", "worried", "standing"],
      ["রিং পর্যন্ত হাত যায় না, পোলটাও দখল হয়ে গেছে।", "Can't reach the ring, and the pole's been taken.", "tired", "standing"],
      ["ব্যাগটা সামনে নিয়ে নেই, এই ভিড়ে কিছুই বলা যায় না।", "Let me move my bag to the front. You never know in this crowd.", "worried", "standing"],
      ["সামনের ভাইয়ের ব্যাকপ্যাকটা প্রতি ব্রেকে আমার গায়ে লাগে।", "That guy's backpack hits me at every brake.", "tired", "standing"],
      ["আমার চুলটা কার জানি বোতামে আটকে গেছে।", "My hair has caught on someone's button.", "worried", "standing"],
      ["আমি বসে আছি, আর সামনের লোকটার ব্যাগ আমার কোলে।", "I'm sitting down, and the man's bag in front is on my lap.", "tired", "seated"],
      ["বাচ্চাটা কোলে নিয়ে বসে আছি, কেউ যেন ধাক্কা না দেয়।", "Sitting with the baby on my lap. Hope nobody knocks into us.", "worried", "seated"],
      ["মহিলা কোচে উঠলেই ভালো হইতো, কিন্তু ওইটা তো আরও ভিড়।", "Should have taken the women's coach, but that's even fuller.", "tired"],
      ["এই পাশের আপার পারফিউমে মাথা ধরে যাইতেছে।", "This apa's perfume is giving me a headache.", "tired"],
      ["কাজীপাড়াতেই এই অবস্থা, শেওড়াপাড়ায় কী হবে?", "This bad at Kazipara already. What happens at Shewrapara?", "grin"],
      ["বাচ্চা নিয়ে উঠছে আপাটা, কেউ একটু সিট ছাড়েন না কেন?", "That apa has a baby with her. Why won't anyone give up a seat?", "worried"],
      ["ফুল ভলিউমে কে জানি নাটক দেখতেছে।", "Someone's watching a natok at full volume.", "tired"],
      ["এই ভিড়ে ফোন বের করা ঠিক হইলো না।", "Shouldn't have taken my phone out in this crowd.", "worried", "phone"],
      ["গান ছাড়া এই ভিড়ে থাকা যাইত না।", "I couldn't get through this crowd without music.", "calm", "music"],
    ],
  },
  seat: {
    men: [
      ["সামনের ভাই উঠবে উঠবে করতেছে, রেডি থাকি।", "The guy in front looks about to get up. Stay ready.", "hopeful", "standing"],
      ["এই আংকেল মতিঝিল পর্যন্ত যাবে মনে হয়, আশা শেষ।", "This uncle looks like he's going all the way to Motijheel. Hope gone.", "sad", "standing"],
      ["মিরপুর ১১-তে উঠলে সিট পাওয়া স্বপ্ন।", "Get on at Mirpur 11 and a seat is a dream.", "tired", "standing"],
      ["ছেড়ে দিলাম সিট, এখন নিজের উপর গর্ব হইতেছে।", "Gave up my seat. Feeling quite proud of myself.", "smile", "standing"],
      ["আরেকটু চেপে বসলে আমিও বসতে পারি, ভাই।", "Squeeze up a bit, brother, and I can sit too.", "hopeful", "standing"],
      ["ঘুমের ভান করি, নাহলে সিট ছাড়তে হবে।", "Let me pretend to be asleep or I'll have to give up my seat.", "wink", "seated"],
      ["চাচা উঠছে, এখন সিট না ছাড়লে মানুষ কী বলবে?", "An old man got on. What will people say if I don't get up?", "worried", "seated"],
      ["উত্তরা থেকে উঠলে সিট পাওয়া যায়, এই জন্যই তো এত সকালে বের হই।", "Get on at Uttara and you get a seat. That's why I leave so early.", "calm", "seated"],
      ["বয়স্কদের সিটে বসছি নাকি? ওই লেখাটা আগে দেখি নাই।", "Am I in the elderly seat? Didn't see the sign.", "worried", "seated"],
      ["সিট পাওয়ার পর মেট্রোটা আসলেই সুন্দর লাগে।", "Once you've got a seat, the metro really is lovely.", "smile", "seated"],
      ["দুই সিটের মাঝখানে বসছে লোকটা, কেউ কিছু বলে না।", "That man is sitting across two seats and nobody says a thing.", "tired"],
      ["ওই সিটটা খালি কেন? নিশ্চয়ই কোনো ঘাপলা আছে।", "Why's that seat free? There must be a catch.", "worried"],
      ["ফোনে ব্যস্ত থাকার ভান করি, কেউ কিছু বলবে না।", "Let me look busy on my phone. Nobody will say anything.", "wink", "phone"],
    ],
    women: [
      ["এই ভাই উঠে গেলে আমি বসতে পারি।", "If this guy gets up, I can sit.", "hopeful", "standing"],
      ["শাড়ি পরে এই ভিড়ে দাঁড়ায় থাকা যায় না। একটা সিট দরকার।", "Can't stand in this crowd in a saree. I need a seat.", "tired", "standing"],
      ["আগারগাঁওতে সবাই নামে, তখন একটা পাব।", "Everyone gets off at Agargaon. I'll get one then.", "hopeful", "standing"],
      ["মহিলা কোচে সিট নাই বলে এইখানে উঠলাম, এখানেও নাই।", "No seats on the women's coach so I came here. None here either.", "sad", "standing"],
      ["পা দুইটা ব্যথা হয়ে গেছে, কেউ কি নামবে না?", "My feet are killing me. Is nobody getting off?", "tired", "standing"],
      ["লোকটা পা ছড়ায় বসছে, আমার জায়গাটা শেষ।", "He's sitting with his legs spread. There goes my space.", "tired", "seated"],
      ["এক ভাই সিট ছেড়ে দিল, মানুষ এখনো ভালো আছে।", "A man just gave me his seat. People are still decent.", "smile", "seated"],
      ["সিটটা ছাড়ব? ওই আপার কোলে বাচ্চা।", "Should I get up? That apa has a baby.", "worried", "seated"],
      ["সবুজ সিটগুলা সুন্দর, কিন্তু এত শক্ত কেন?", "Nice green seats, but why so hard?", "calm", "seated"],
      ["আমার পাশের সিট খালি, কেউ এসে না বসলেই হয়।", "The seat next to me is empty. Hope nobody takes it.", "wink", "seated"],
      ["ওই আন্টি আমাকে দেখে হাসল কেন? সিট চায় নাকি?", "Why did that aunty smile at me? Does she want my seat?", "worried", "seated"],
      ["ব্যাগটা পাশের সিটে রাখলে কেউ কিছু বলবে?", "Would anyone mind if I put my bag on the next seat?", "wink", "seated"],
      ["বসে বসে ফোন টিপি, কারো দিকে না তাকাই।", "Sit, scroll, look at nobody.", "calm", "phone"],
      ["একটা সিট খালি হইলে সবাই কেমন তাকায়, দেখার মতো।", "Everyone's face when a seat comes free. Worth watching.", "grin"],
    ],
  },
  sleep: {
    men: [
      ["আজকে ঘুম থেকে উঠতে লেট হয়ে গেছে, তাও একটু ঝিমায় নেই।", "Woke up late today. Still, let me doze a bit.", "tired", "seated"],
      ["পাঁচ মিনিট চোখ বন্ধ করি, আগারগাঁও আসলে উঠে যাব।", "Five minutes with my eyes shut. I'll wake at Agargaon.", "calm", "seated"],
      ["শেষবার ঘুমাইয়া মতিঝিল চলে গেছিলাম।", "Last time I slept I ended up at Motijheel.", "grin", "seated"],
      ["পাশের ভাইয়ের ঘাড়ে মাথা পড়ে গেছিল, সরি ভাই।", "My head dropped on the next guy's shoulder. Sorry, brother.", "grin", "seated"],
      ["কোন স্টেশন এইটা? ঘুমের মধ্যে কিছুই শুনি নাই।", "Which station is this? Slept through the announcement.", "worried", "seated"],
      ["দাঁড়ায় দাঁড়ায় ঘুমানো সম্ভব, আজকে প্রমাণ হইলো।", "You can sleep standing up. Proven today.", "grin", "standing"],
      ["রিং ধরে চোখ বন্ধ করলাম, পড়ব না তো?", "Holding a ring with my eyes closed. I won't fall, will I?", "worried", "strap"],
      ["মাথাটা প্রচণ্ড ব্যথা করতেছে।", "My head is pounding.", "sad"],
      ["রাতে ক্রিকেট না দেখলেই হইতো।", "Shouldn't have watched cricket all night.", "tired"],
      ["এই ট্রেনের দুলুনিতে ঘুম আসেই।", "The way this train sways puts anyone to sleep.", "calm"],
      ["এসির বাতাসে চোখ বন্ধ হয়ে আসতেছে।", "The AC is shutting my eyes.", "calm"],
      ["কাল থেকে রাত ১২টার মধ্যে ঘুমাব, সত্যি।", "From tomorrow, in bed by midnight. Really.", "hopeful"],
      ["এক কাপ চা হইলে চোখটা খুলতো। মেট্রোতে তো খাওয়াও যায় না।", "A cup of tea would open my eyes. You can't even drink on here.", "sad"],
    ],
    women: [
      ["ঘুমে ঢুলতেছি, ব্যাগটা শক্ত করে ধরি।", "Nodding off. Let me hold my bag tight.", "worried", "seated"],
      ["জানালার কাচে মাথা রাখলেই ঘুম চলে আসে।", "Rest my head on the window glass and I'm gone.", "calm", "seated"],
      ["চোখ বন্ধ করে আছি, কেউ যেন কথা না বলে।", "Eyes shut. Nobody talk to me.", "calm", "seated"],
      ["রিং ধরে দাঁড়ায় দাঁড়ায় হাই তুলতেছি, মুখটা ঢাকা দরকার।", "Yawning while holding on to this ring. Should cover my mouth.", "grin", "strap"],
      ["ঘুমায় গেলে নামতে পারব না। অ্যালার্ম দিয়ে রাখি।", "If I doze off I'll miss it. Let me set an alarm.", "worried", "phone"],
      ["রাতে বাচ্চাটা ঘুমাইতে দেয় নাই, এখন চোখ খোলা রাখতে পারতেছি না।", "The baby kept me up. I can't keep my eyes open.", "tired"],
      ["মাথাটা ধরে আছে সকাল থেকে, ওষুধটাও আনি নাই।", "Head's been aching since morning, and I forgot the tablet.", "sad"],
      ["কাল রাত ৩টা পর্যন্ত অ্যাসাইনমেন্ট করছি, এখন চোখ খুলে রাখা অসম্ভব।", "Assignment till 3am. Keeping my eyes open is impossible.", "tired"],
      ["এই আপু কীভাবে বসে বসে ঘুমাইতেছে? মাথাও পড়ে না।", "How does this apu sleep sitting up? Her head doesn't even drop.", "grin"],
      ["অফিসে যেয়েই একটা চা খাব, আগে পৌঁছাই।", "Tea as soon as I reach the office. First get there.", "tired"],
      ["এসিটা এত ঠান্ডা, চাদর আনলে ঘুমটা জমতো।", "The AC is so cold. With a shawl I'd be fast asleep.", "calm"],
      ["আজকে আর পারতেছি না, ছুটি নিলেই হইতো।", "I can't do today. Should have taken leave.", "tired"],
    ],
  },
  late: {
    men: [
      ["হেডফোন আনতে ভুলে গেছি।", "Forgot my headphones.", "sad", "nomusic"],
      ["৯টায় মিটিং, এখন ৮:৫০, এখনো কাজীপাড়া।", "Meeting at 9. It's 8:50, and I'm still at Kazipara.", "worried"],
      ["বসকে কী বলব? মেট্রো লেট? মেট্রো তো লেট হয় না।", "What do I tell the boss? Metro's late? The metro's never late.", "worried"],
      ["চল ভাই চল, আরেকটু জোরে চল।", "Come on, come on, go a bit faster.", "worried"],
      ["শার্টটা ইস্ত্রি করা হয় নাই, কেউ খেয়াল করবে না তো?", "Didn't iron this shirt. Nobody will notice, right?", "worried"],
      ["নাশতা না করে বের হইছি, পেটটা ডাকতেছে।", "Left without breakfast. My stomach is growling.", "tired"],
      ["দাড়িটা কাটার সময় পাই নাই।", "No time to shave.", "tired"],
      ["ঘরের চাবি নিছি তো? পকেটে দেখি।", "Did I take the house keys? Let me check my pocket.", "worried"],
      ["ক্লাস শুরু হয়ে গেছে, এখনো শাহবাগ আসে নাই।", "Class has started. Shahbagh's not here yet.", "worried"],
      ["কার্ডে টাকা আছে তো? বের হইতে যেয়ে আটকায় গেলে শেষ।", "Is there money on my card? If the gate stops me I'm done.", "worried"],
      ["ফার্মগেট আর কতক্ষণ? ফোনে দেখি।", "How much longer to Farmgate? Let me check.", "worried", "phone"],
      ["অফিসের গ্রুপে সবাই গুড মর্নিং দিয়ে দিছে, আমি এখনো মেট্রোতে।", "Everyone's said good morning in the office group. I'm still on the train.", "worried", "phone"],
      ["মোবাইলে চার্জ ১২%। পাওয়ার ব্যাংকটাও বাসায়।", "12% battery. Power bank's at home.", "worried", "phone"],
    ],
    women: [
      ["হেডফোন আনতে ভুলে গেছি, পুরা রাস্তা এখন এদের কথা শুনতে হবে।", "Forgot my headphones. Now I get to hear all of this the whole way.", "tired", "nomusic"],
      ["সকালের ক্লাসটা মিস হবেই আজকে।", "Missing the morning class for sure today.", "worried"],
      ["তাড়াহুড়ায় চুলার গ্যাস বন্ধ করছি তো?", "In the rush, did I turn off the gas?", "worried"],
      ["টিফিনটা টেবিলের উপর রেখে আসছি।", "Left my tiffin on the table.", "sad"],
      ["এত তাড়াহুড়া করে বের হইছি, কাজলটা এক চোখে দেওয়া হইছে।", "Rushed so much I've got kajal on one eye only.", "grin"],
      ["মতিঝিল আর চার স্টেশন। পৌঁছায় যাব। পৌঁছায় যাব।", "Four more stations to Motijheel. I'll make it. I'll make it.", "hopeful"],
      ["ছাতাটা কি বাসায় রেখে আসছি?", "Did I leave my umbrella at home?", "worried"],
      ["আইডি কার্ড! আইডি কার্ড নিছি তো?", "ID card! Did I bring my ID card?", "worried"],
      ["আব্বু বলছিল আগে বের হইতে, ঠিকই বলছিল।", "Abbu told me to leave earlier. He was right.", "sad"],
      ["কার্ডে কি ব্যালেন্স আছে? গতকাল রিচার্জ করতে ভুলে গেছি।", "Is there balance on my card? Forgot to top up yesterday.", "worried"],
      ["ম্যাডামকে টেক্সট দিয়ে দেই, ১০ মিনিট লেট।", "Let me text Madam. Ten minutes late.", "worried", "phone"],
      ["বাচ্চাটা স্কুলে ঠিকমতো পৌঁছাইছে কিনা, একবার ফোন দেই।", "Did the kid reach school okay? Let me call once.", "worried", "phone"],
      ["মোবাইলে ২০% চার্জ, আজকের দিনটা কেমনে যাবে?", "20% battery. How will I get through today?", "worried", "phone"],
    ],
  },
  first: {
    men: [
      ["প্রথম বার উঠলাম মেট্রোতে, নট ব্যাড নট ব্যাড।", "First time on the metro. Not bad, not bad.", "grin"],
      ["এত ঠান্ডা! বাসে তো এই জিনিস পাই না।", "So cold! Never get this on the bus.", "smile"],
      ["উপর থেকে আমার এলাকাটা কী ছোট লাগে।", "My neighbourhood looks so small from up here.", "smile"],
      ["টিকিটটা রাখতে হবে, বের হওয়ার সময় লাগবে।", "Keep the ticket. I'll need it to get out.", "worried"],
      ["আব্বাকে একদিন নিয়ে আসতে হবে।", "I have to bring Abba one day.", "love"],
      ["এত জোরে যাইতেছে, টেরই পাওয়া যায় না।", "It's going so fast and you can't even tell.", "smile"],
      ["সবাই এত চুপচাপ কেন? বাসে তো এতক্ষণে ঝগড়া লেগে যাইতো।", "Why's everyone so quiet? On the bus there'd be a fight by now.", "grin"],
      ["এত পরিষ্কার, জুতা খুলে উঠতে হয় নাকি?", "So clean. Was I meant to take off my shoes?", "grin"],
      ["স্ক্রিনে লেখা পরের স্টেশন, এইটাই কি আমার?", "The screen says next station. Is that mine?", "worried"],
      ["গ্রামে গিয়ে বলব, ঢাকায় আকাশ দিয়ে ট্রেন চলে।", "I'll tell them in the village: in Dhaka, trains run through the sky.", "grin"],
      ["রিং ধরে দাঁড়াইলে নিজেকে বিদেশি বিদেশি লাগে।", "Holding this ring, I feel like I'm abroad.", "grin", "strap"],
      ["একটা ভিডিও করি, বাড়িতে দেখাব।", "Let me film this to show them at home.", "grin", "phone"],
    ],
    women: [
      ["মা বলছিল ভয় লাগবে। ভয় তো লাগতেছে না।", "Ma said I'd be scared. I'm not.", "smile"],
      ["উপর থেকে রাস্তার জ্যামটা দেখতে কী মজা।", "How fun to look down on the jam from up here.", "grin"],
      ["এত পরিষ্কার! আমার বাসাও এত পরিষ্কার না।", "So clean! Cleaner than my house.", "grin"],
      ["কার্ডটা ছোঁয়াইলেই গেট খুলে গেল, মজা তো।", "Just touched the card and the gate opened. Fun.", "smile"],
      ["আম্মুকে নিয়ে আসতে হবে, আম্মু তো বিশ্বাসই করবে না।", "I must bring Ammu. She won't believe it.", "love"],
      ["ভিতরে কী ঠান্ডা, বাইরে তো গরমে মরে যাচ্ছিলাম।", "So cold inside. I was dying of heat out there.", "smile"],
      ["মেয়েদের আলাদা কোচ আছে জানতাম না, পরেরবার ওইটায় উঠব।", "Didn't know there was a coach just for women. Next time.", "hopeful"],
      ["কোন দিকে নামব? দরজা কোন দিকে খুলবে?", "Which side do I get off? Which way do the doors open?", "worried"],
      ["এত সোজা! তাহলে এতদিন কেন উঠি নাই?", "So easy! Why didn't I come sooner?", "smile"],
      ["মেয়েকে জানালাটা দেখাই, ও খুব খুশি হবে।", "Let me show my daughter the window. She'll love it.", "love"],
      ["স্ক্রিনে বাংলা ইংরেজি দুইটাই লেখা, ভালোই তো।", "Bangla and English on the screen. Nice.", "calm"],
      ["একটা ছবি তুলি, ফেসবুকে দিব।", "Let me take a photo for Facebook.", "grin", "phone"],
    ],
  },
  cab: {
    men: [
      ["সবুজ সিগন্যাল। চল।", "Green signal. Let's go.", "calm"],
      ["কাচের ওপাশে একটা বাচ্চা হাত নাড়তেছে।", "A kid is waving at me through the glass.", "love"],
      ["এই ডিউটি শেষে একটা গরম চা।", "One hot tea when this shift ends.", "hopeful"],
      ["উত্তরা থেকে মতিঝিল, আবার মতিঝিল থেকে উত্তরা। আজকে কয় নম্বর?", "Uttara to Motijheel and back. Which trip is this?", "tired"],
      ["সামনে পুরা লাইন ফাঁকা, এই দৃশ্যটা শুধু আমি দেখি।", "The whole line clear ahead. Only I get this view.", "smile"],
      ["পিছনে ছয় কোচ মানুষ ঝিমাইতেছে, আমার তো সেই উপায় নাই।", "Six coaches of people dozing behind me. I don't get that option.", "grin"],
    ],
    women: [
      ["সবুজ সিগন্যাল। চল।", "Green signal. Let's go.", "calm"],
      ["লোকজন উঁকি দিয়ে দেখে, মেয়ে চালাচ্ছে নাকি।", "People peer in to see if a woman's really driving.", "grin"],
      ["কাচের ওপাশে একটা মেয়ে হাত নাড়তেছে, আমিও নাড়ি।", "A girl's waving through the glass. I'll wave back.", "love"],
      ["ডিউটি শেষে আম্মুকে ফোন দিব।", "I'll call Ammu when this shift ends.", "love"],
      ["সামনে পুরা লাইন ফাঁকা, এই দৃশ্যটা শুধু আমি দেখি।", "The whole line clear ahead. Only I get this view.", "smile"],
      ["আজকে সব ঠিকঠাক চলতেছে, এই রকম দিনই ভালো।", "All running right today. I like days like this.", "smile"],
    ],
  },
};

/** Every line that could cross the mind of a woman or a man on this theme's coach, however they ride. */
export function thoughtsOf(theme: Theme | "cab", female: boolean): readonly Thought[] {
  return (female ? LINES[theme].women : LINES[theme].men).map(([bn, en, mood, fits = "any"]) => ({ bn, en, mood, female, fits }));
}

export const NAMES_F = [
  ["নুসরাত", "NUSRAT"], ["মিতু", "MITU"], ["জান্নাত", "JANNAT"], ["রুমানা", "RUMANA"], ["লামিয়া", "LAMIA"], ["ফারজানা", "FARZANA"],
  ["তিথি", "TITHI"], ["সাদিয়া", "SADIA"], ["সালমা", "SALMA"], ["পপি", "POPY"], ["শিউলি", "SHIULI"], ["রেহানা", "REHANA"],
] as const;

export const NAMES_M = [
  ["রাফি", "RAFI"], ["তানভীর", "TANVIR"], ["শুভ", "SHUVO"], ["আরিফ", "ARIF"], ["সাব্বির", "SABBIR"], ["হাসান", "HASAN"],
  ["ইমরান", "IMRAN"], ["মাহিন", "MAHIN"], ["রহিম", "RAHIM"], ["জসিম", "JOSHIM"], ["কামাল", "KAMAL"], ["সজীব", "SAJIB"],
] as const;

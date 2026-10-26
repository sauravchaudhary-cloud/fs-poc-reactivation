// The rules every word has to pass: what a customer typed, normalised before any rule reads it; what WhatsApp won't carry
// (alcohol, supplements, infant food); and the deck's copy rules, which `npm run check` holds the flows to and `vet` holds
// every AI reply to. No imports, so the copy in content/ can lean on it too.

// Unicode's format characters (\p{Cf}: zero-width spaces, direction marks) and the other invisible ones: the grapheme
// joiner, the Hangul fillers and Khmer's two inherent vowels.
const INVISIBLE = /[\p{Cf}\u034F\u115F\u1160\u17B4\u17B5\u3164\uFFA0]/gu;

// What a customer typed, as the rules and the model read it: compatibility forms folded (ＳＴＯＰ is STOP) and invisible
// characters dropped, so neither a zero-width space nor a direction mark can slip a word past a rule.
export const clean = (text: string) => asciiDigits(text.normalize("NFKC").replace(INVISIBLE, "")).trim();

// Alcohol in English, Hinglish, Hindi or emoji, but not "red wine vinegar".
export const ALCOHOL =
  /\b(wines?|beers?|whisk(e)?y|whiskies|vodka|gin|rum|alcohol\w*|liquors?|liqueurs?|daaru|daru|sharab|sharaab|champagne|prosecco|brut|shiraz|merlot|cabernet|sauvignon|chardonnay|pinot|riesling|malbec|zinfandel|tequila|brandy|cognac|scotch|bourbon|cider)\b(?!\s+(vinegar|essence|extract|flavou?r))|🍷|🥂|🍾|🍸|🥃|🍺|🍻|🍹|(?<![\p{L}\p{M}])(शराब|दारू|वाइन|बीयर|बियर|व्हिस्की|वोडका|रम)(?![\p{L}\p{M}])/iu;
// What Meta's Commerce Policy and the IMS Act keep off WhatsApp: the AI's searches never return these.
// Brands too, since the catalogue's categories can't be queried: an alcohol brand's soda is a surrogate ad in India.
export const RESTRICTED = new RegExp(
  `${ALCOHOL.source}|\\b(tobacco|cigar\\w*|hookah|paan masala|nicotine|rolling papers?|vape|whey|protein (powder|isolate|blend|shake)|(plant|pea|soy) protein|supplements?|multivitamins?|collagen|glutathione|biotin|creatine|ashwagandha|probiotic|melatonin|(vitamin|herbal|probiotic) \\w* ?(tablets?|capsules?|gummies)|(throat|sleep|immunity|beauty|glow|hair|skin) (gummies|blend|powder)|infant|toddler|weaning|formula milk|baby (formula|food)|feeding bottles?|cerelac|lactogen|nan ?pro|similac|enfamil|aptamil|farex|gerber|non[- ]alcoholic|sula|kingfisher|bira|budweiser|heineken|fratelli)\\b`,
  "iu",
);

// The deck's copy rules (`npm run check` holds the flows to them), and what an AI reply must never do on top: promise
// stock on a date, offer a deal, name alcohol, claim or promise an action nobody takes, link off the site, or state a
// number (price, phone, order) that isn't in what it was shown. A reply that breaks one isn't sent; `fallbackReply` is.
export const BANNED =
  /\bwe saw\b|\bwe noticed\b|you were looking|you looked at|you viewed|you browsed|you searched|\btracking\b|\bteam\b/i;
export const FORECAST =
  /next (batch|harvest|drop|tin|one is due)|\bdue (on|this|next)|the day it|when it's (in|back|ready)|when it lands|if they're back|tomorrow's (batch|bake)|out of the oven at \d|keep one (from|for)|(?<!(can'?t|cannot|can not|won'?t|don'?t|not|unable to) )\breserv(e|ed|ing|ation)/i;
// About stock coming back, not "come back soon!" or "the 6–8 pm slot is available this evening".
const RESTOCK =
  /\b(back in stock|restock\w*|available again|in stock again|(it|they|this|that|stock)('ll| will| should)? (come|comes|be coming) back)( again)? (by|next|tomorrow|later|soon|shortly|in a (day|few)|in \d+ (days?|weeks?)|on (mon|tue|wed|thu|fri|sat|sun)|this (week|weekend|morning|afternoon|evening))|\b(will|'ll|should|would|may|might) be (back|in stock|restocked|available again)\b|\b(stock|batch|delivery) (arrives|lands|comes in)\b/i;
// An offer, not a denial: "No codes from us" and "that cashback message isn't ours" pass.
const DEAL =
  /\d+\s?(%|percent|per cent)\s?(off|cashback|discount|chhoot|chhut|छूट)|\bhalf (off|price)\b|\bbogo\b|\bbuy (one|1),? get (one|1)\b|\bon the house\b|\b(staff|special|extra|exclusive) (discount|price|offer)\b|\bdiscount (applies|applied|of)\b|छूट मिल|डिस्काउंट मिल|कूपन कोड|कैशबैक मिल|मुफ़्त|मुफ्त|\bmuft\b|(₹|rs\.?)\s?\d[\d,]*\s?(off|cashback|discount)\b|\b(use|apply|enter|redeem) (the |this |my |our )?(code|coupon|voucher|promo)|\bcode:? (?=[a-z]*\d)[a-z0-9]{4,}\b|\b(get|earn|enjoy|avail|unlock)( a| an| the)? (cashback|discount|coupon|voucher)|\bon us\b|complimentary|(?<!(gluten|sugar|dairy|lactose|fat|nut|egg|caffeine|alcohol|cruelty|preservative|msg|gmo|feel|carb|soy|wheat|grain|guilt|hands|toll|duty|cage)[ -])\bfree\b(?! (from|range|of (gluten|sugar|dairy|nuts?|preservatives|added sugar|msg)))/i;
// FSSAI and Meta: no health claims at all, no false urgency, and label words only where the product data says them.
const HEALTH =
  /\b(cures?|prevents?|heals?|treats?|fights?) (\w+ ){0,2}(diseases?|illness|cancer|diabetes|bp|blood pressure|colds?|coughs?|flu|infections?|inflammation|cholesterol)\b|\b(boosts? (your )?immunity|immunity|good for (your |his |her |their )?(health|heart|diabetes|bp|blood pressure|weight|skin|gut)|doctor recommended|(safe|fine|okay|suitable) (for|in) (diabetics?|pregnan\w*|you|your|him|her|them|kids|children|babies|people with)|diabetic[- ]friendly|weight loss|detox|sehat ke liye|diabetes mein (accha|faydemand))\b|फायदेमंद|फ़ायदेमंद|इम्युनिटी|इम्यूनिटी|रोग प्रतिरोधक|इलाज|डायबिटीज़? (में|के लिए) (अच्छा|सुरक्षित)/i;
const URGENCY =
  /\b(only (a few|few|\d+) left|last (few|\d+|one|pieces?)( \w+)? (left|remaining)|hurry|today only|selling fast|limited (stock|time)|while stocks? last|before it'?s gone)\b/i;
// Only the bot knows when customer care replies ({care_by}); the AI never says how soon.
const SOON =
  /\b(reply|respond|call|get back|deliver\w*|refund\w*|dispatch\w*|customer care|someone|a person|connect\w*|contact\w*|bhej\w*|baat)\b[^.!?]{0,40}\b(right away|immediately|shortly|asap|soon|in (a few|\d+) (minutes|mins|hours)|abhi|jald(i| hi)?)\b|\b(right away|immediately|shortly|asap|abhi|jald(i| hi)?)\b[^.!?]{0,40}\b(reply|respond|call|connect|contact|deliver|refund|bhej\w*|baat)|\bturant\b|तुरंत|जल्द/i;
const CLAIMS = /100 ?%|\b(pure|natural|organic|home-?made|healthy|healthier)\b/gi;
// Saying it can't make the claim isn't making it ("we can't call foods healthy"): only up to the first claim word, so a
// claim later in the sentence ("…, but these are organic") is still checked.
const DISCLAIM =
  /\b(can'?t|cannot|can not|won'?t|don'?t|do not|unable to|not able to) (call|say|claim|confirm|tell|promise|judge)\b[^.!?,;]{0,40}?(100 ?%|\b(pure|natural|organic|home-?made|healthy|healthier)\b)/gi;
// Done or promised by someone, in any voice or language: only a tool's own action (a handoff) may be described.
const DID =
  /\b(shall|should|can|may) (I|we) (reserve|book|hold|keep|place|put)\b|\bwould you like (me|us) to (reserve|book|hold|keep|place|put)\b|\b(I|we)( have|'ve)? (just )?(added|reserved|booked|placed|cancell?ed|refunded|set aside|put aside|held|kept|saved|processed|approved|scheduled|arranged)\b|\b(I|we)('ll| will) (add|reserve|book|hold|keep|set aside|call|ring|message|text|remind|notify|ping|refund|cancel|arrange|deliver|send|check|get back|let you know|update you|email)\b|\b(won'?t|will not|never) (message|text|contact|write|send|whatsapp|bother)( to)? you\b|\b(has|have) been (processed|added|cancell?ed|refunded|reserved|booked|kept|saved|approved|credited|dispatched|scheduled|arranged)\b|\b(will|'ll) be (delivered|credited|refunded|added|reserved|dispatched)\b|\b(customer care|the concierge|concierge|someone|a person|our staff|the store)( team)? (will|'ll|is going to) (call|ring|confirm|email|message|contact|visit|deliver|send)\b|\b(kept|set|put) (\w+ ){0,3}aside\b|\b(ho gaya|ho gayi|kar diya|kar diye|kar di|rakh diya|rakh diye|daal diya|daal diye|bhej diya|bhej denge|bhej dunga|kar denge|kar dunga|call karenge|call karega|contact karenge)\b|कर दिया|भेज (दिया|देंगे|दूँगा|दूंगा)|करेंगे|रख दिया/i;
const UNIT =
  /(\d[\d,]*)\s?(°|deg\b|g\b|gm\b|grams?\b|kg\b|ml\b|l\b|litres?\b|liters?\b|cm\b|minutes?\b|mins?\b|hours?\b|hrs?\b|people\b|guests\b|pieces?\b|pcs\b|servings?\b)/gi; // 180°C, 200 g: not prices
// Any link, with a scheme or without ("foodst0ries.shop/claim"), in any case.
const LINKS =
  /\bhttps?:\/\/[^\s)]+|\b([a-z0-9-]+\.)+(com|in|shop|net|org|co|io|app|xyz|info|me|link|ly|store|site|online|page)\b(\/[^\s)]*)?/gi;

// WhatsApp formatting, and no template placeholders: "{concierge_by}" in the model's text would be filled in as a promise.
export const tidy = (text: string) =>
  text
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/^#+\s*/gm, "")
    .replace(/\[([^\]\n]+)\]\((\S+?)\)/g, "$1: $2")
    .replace(/\{(choice|item|care_by|concierge_by)\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// The first rule a reply breaks, by name, or undefined. `shown` is what the model was shown: its numbers and product
// names are the catalogue's, so the reply may repeat them.
export function vet(reply: string, shown: string): string | undefined {
  const text = clean(reply);
  const seen = asciiDigits(shown);
  const known = knownNumbers(text, seen);
  // A product's own name ("Immunity Boosters", "Olivewood Reserve") is the catalogue speaking, not a claim.
  const ownWords = withoutProductNames(text, seen);
  // In order: the first broken rule's name is what the model is told on its retry, and what the checks expect.
  const rules: [string, boolean][] = [
    ["empty", !text.trim()],
    ["too long", text.length > 1000],
    ["banned words", BANNED.test(ownWords)],
    ["stock forecast", FORECAST.test(ownWords) || RESTOCK.test(ownWords)],
    ["a deal", DEAL.test(ownWords)],
    ["a health claim", HEALTH.test(ownWords)],
    ["false urgency", URGENCY.test(ownWords)],
    ["a time only customer care can give", SOON.test(ownWords)],
    ["a claim the product data doesn't make", unbackedClaim(ownWords, seen)],
    ["alcohol", ALCOHOL.test(ownWords)],
    ["an action nobody takes", DID.test(ownWords)],
    ["a link off the site", offSiteLink(text)],
    ["a number it wasn't shown", [...numbersIn(text), ...rupees(text)].some((n) => !known.has(n))],
  ];
  return rules.find(([, broken]) => broken)?.[0];
}

// Digits in every script (Devanagari ०–९, Urdu ۰–۹ and the rest) read as 0–9, so ₹९९ is checked like ₹99. Unicode
// lays each script's digits out from a zero at the start of a 16-block or 6 into it.
const asciiDigits = (text: string) =>
  text.replace(/\p{Nd}/gu, (digit) => {
    const code = digit.codePointAt(0)!;
    const zeroStartsBlock = /\p{Nd}/u.test(String.fromCodePoint(code - (code & 15)));
    return String(zeroStartsBlock ? code & 15 : (code - 6) & 15);
  });

// The numbers a reply may state: any it was shown, this year and next, and its own measures, which aren't prices.
const knownNumbers = (text: string, seen: string) => {
  const year = new Date().getFullYear();
  return new Set([
    ...numbersIn(seen, 1),
    String(year),
    String(year + 1),
    ...[...text.matchAll(UNIT)].map((match) => match[1].replace(/,/g, "")),
  ]);
};

const withoutProductNames = (text: string, seen: string) =>
  [...seen.matchAll(/"name":"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => JSON.parse(`"${match[1]}"`) as string)
    .reduce((rest, name) => rest.split(name).join(" "), text);

// A label word ("organic", "100%") that isn't in the product data it was shown.
const unbackedClaim = (text: string, seen: string) =>
  (text.replace(DISCLAIM, " ").match(CLAIMS) ?? []).some(
    (claim) => !seen.toLowerCase().includes(claim.toLowerCase().replace(/\s/g, "")),
  );

const offSiteLink = (text: string) =>
  (text.match(LINKS) ?? []).some((url) => !/^(https:\/\/)?(www\.)?foodstories\.shop(\/|$)/i.test(url));

// Every run of `min` or more digits, read through thousands separators ("1,250" is 1250).
const numbersIn = (text: string, min = 3) =>
  text.replace(/(\d),(?=\d)/g, "$1").match(new RegExp(`\\d{${min},}`, "g")) ?? [];

// Every rupee amount ("₹99", "Rs. 1,250", "450/-"), of any length, as its digits.
const rupees = (text: string) =>
  [
    ...(text.match(/(₹|₨|\brs\.?|\binr|\brupees?) ?\d[\d,]*/gi) ?? []),
    ...(text.match(/\d[\d,]*\s?(rupees?|rs\b|\/-)/gi) ?? []),
  ].map((amount) => amount.replace(/\D/g, ""));

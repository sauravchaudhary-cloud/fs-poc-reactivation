// Reading what a customer types, the same way in the webhook (lib/whatsapp.ts) and the demo: what the rules settle, and
// what goes to the AI (lib/ai.ts), or to `fallbackReply` when the AI is off or its answer fails.
import { declines, optionsOf, type Flow, type Msg, type Option } from "./bot.ts";
import { faq, REPLIES } from "../content/replies.ts";

type Intent = "crisis" | "stop" | "wrong" | "start" | "who" | "escalate" | "human" | "thanks" | "no" | "yes" | "other";

export type Read =
  | { do: "crisis" | "stop" | "wrong" | "start" | "who" | "escalate" | "human" | "media" | "ai" }
  | { do: "node"; node: string }
  | { do: "tap"; option: Option }
  | { do: "say"; msg: Msg };

// Each rule is narrow on purpose ("stop the delivery" isn't an opt-out): what they miss goes to the AI, which has a tool
// for each of them (lib/ai.ts), so a miss costs a model call, not a wrong answer. `\b` is ASCII-only, so in the Indic
// scripts a word ends where no letter follows.
const CRISIS =
  /\b(kill(ing)? myself|kms|suicid\w*|end(ing)? (my life|it all)|take my (own )?life|(want to|wanna|going to|gonna) die|wish i (was|were) dead|better off dead|don'?t want to (live|be alive|be here)|no (reason|will) to live|hurt(ing)? myself|self[- ]?harm|(jeena|jina|jeene ka mann) nahi|nahi (jeena|jina)|mar (jaana|jana)|marna (chaht\w*|hai)|jaan de (dunga|dungi|denge)|khud ko khatam|khudkushi|aatmahatya)\b|मरना (चाह|है)|मर जा(ना|ऊँ|उँ)|नहीं जीना|जीना नहीं|जीने (का मन|की इच्छा) नहीं|जान दे (दूँगा|दूंगा|दूँगी|दूंगी)|खुद को खत्म|आत्महत्या|खुदकुशी/i;
const STOP =
  /^\W*(please |pls |plz |kindly |hi,? )?(stop|unsubscribe|unsub|opt ?out)( (me|it|this|these|that|them|now|please|pls|all( of)?( this| these)?|(sending|messaging|texting|whatsapping)( me)?( these| this| them| messages| msgs| texts)?|(the )?(messages|msgs|promotions?|offers|marketing)))*\W*$|\b(unsubscribe me|i want to unsubscribe|opt me out|take me off (your|the) (list|mailing list)|remove (me|my number) from)\b|\bno more (messages|msgs|whatsapps?)( please| pls)?\W*$|^\W*not interested\b.{0,15}\b(stop|unsubscribe)\W*$|\b(don'?t|do not|never|stop) (send|message|msg|text|whatsapp|contact)(ing)? me\b|^\W*(please |pls )?(band ?karo|bandh ?karo|band kar ?do|band kardo|band kijiye)( yaar| bhai| please| pls)?\W*$|\b(mujhe|humein|hume)\b.{0,25}\b(mat|na) (bhejo|bhejiye|bhejna|karo)\b|\b(messages?|msgs?|massage|sms|whatsapp)\b.{0,15}\b(mat bhejo|mat bhejiye|mat karo|band karo|band kar do|band kardo)\b|^\W*(ये सब |ये |यह सब |कृपया )?(बंद कर(ो|ें|ा| दो| दीजिए)|बंद कीजिए)\W*$|(मैसेज|मेसेज|संदेश).{0,15}(बंद कर|मत भेज)|मुझे.{0,15}मत भेज|अनसब्सक्राइब/i;
const WRONG =
  /^\W*(wrong|galat) (number|person)\W*$|\b(you('ve| have)( got)?|this is|it'?s|that'?s) (the |a )?(wrong|galat) (number|person)\b(?! of)|\b(not|isn'?t) my number\b(?! (on|in|for))|\bthis is(n'?t| not) (her|him|them|me)\b|गलत नंबर|(ये|यह) मेरा नंबर नहीं/i;
const START = /^(start|resume|subscribe|unstop|shuru karo)\W*$/i;
const WHO = /\bwho('s| is) this\b|\bwho are you\b|^\W*((aap|tum|ap) )?kaun (ho|hai)\W*$|आप कौन (हैं|हो)/i;
// A threat, not a mention: "my lawyer friend loves your cheese" isn't one.
const ESCALATE =
  /\b(sue|suing|sued)\b|\b(see|take|drag) (you|u) (in|to) court\b|\bconsumer (court|forum)\b|\b(legal|lawyer'?s?|advocate'?s?) (notice|action|case)\b|\b(file|filing|lodge|lodging|register|registering|raise)( a)? (complaint|case|fir)\b.{0,25}\b(fssai|police|consumer|court|against you)\b|\b(police|fssai) (complaint|case)\b|\bfir (karwa|darj|lodge|file)\w*|\b(adalat|court) (jaunga|jaungi|jayenge|jaenge|le jaunga)\b|\b(mukadma|mukadama|case) (karunga|karungi|karenge|kar dunga)\b|\bvakeel (se|ko) (baat|notice)|उपभोक्ता (अदालत|फोरम|फ़ोरम)|कोर्ट (जाऊँगा|जाऊंगा|जाऊँगी|जाएंगे)|अदालत (जाऊँगा|जाऊंगा|जाऊँगी)|मुकदमा (करूँगा|करूंगा|करेंगे)|केस (करूँगा|करूंगा|करेंगे)|वकील से बात|एफ़?आईआर|पुलिस (में|को) (शिकायत|रिपोर्ट)/i;
// Asking for one, not a mention: "is the cheese made by a real person?" isn't.
const HUMAN =
  /\b(talk|speak|chat|connect)( me)? (to|with) (a |an |some |your )?(real |actual |live )?(human|person|agent|executive|manager|someone|somebody|customer care)\b|\b(want|need|get me|give me)( to talk to)? (a |an |your )?(real |actual |live )?(human|person|agent|manager|supervisor)\b|^\W*(a )?(real |actual |live )?(human|person|agent|representative)( please| pls)?\W*$|\b(insaan|manager) se baat\b|इंसान (से|चाहिए)/i;
const THANKS = /^(ok )?(thanks|thank you|thx|great|lovely|perfect|cool|shukriya|dhanyavaad|🙏|❤️|😊)\W*$/i;
// Yes and no stand in for a tap only when that's all the message says: "haan gruyere bhejo" says more, and "don't send
// it" or "ok no" holds a no, so the AI reads those. A negation inside a yes makes it not a yes.
const NO =
  /^(no|nope|nah|nahi|nahin|nhi|not now|abhi nahi|नहीं|ना|नाही|ಇಲ್ಲ|కాదు|వద్దు|வேண்டாம்|না)(?![\p{L}\p{M}\p{N}])(?! (problem|prob|worries|worry|issues?|tension|stress|hurry|rush)\b)/iu;
const YES =
  /^\W*((yes|yeah|yep|ya|yup|ok|okay|okk|sure|haan|ha+n|ji|ji haan|theek hai|thik hai|bhejo|bhej do|send|send it|हाँ|हां|जी|जी हाँ|ಹೌದು|అవును|ஆம்|হ্যাঁ|👍|✅)[\s,!.]*){1,3}(please|pls|plz)?[\s!.]*$/iu;
const NEGATION =
  /(?<![\p{L}\p{M}])(no|not|never|don'?t|nahi|nahin|nhi|mat|band|cancel|skip|stop|rehne|नहीं|मत|बंद)(?![\p{L}\p{M}])/iu;

// Typed text, in order: a crisis first, then STOP and "wrong number" end things, START resumes, "who is this", a legal
// threat and asking for a person get their own line, then thanks as a nod and yes/no as a tap on the last message. The
// first rule that matches names the intent.
const RULES: [Intent, (text: string) => boolean][] = [
  ["crisis", (text) => CRISIS.test(text)],
  ["stop", (text) => STOP.test(text)],
  ["wrong", (text) => WRONG.test(text)],
  ["start", (text) => START.test(text)],
  ["who", (text) => WHO.test(text)],
  ["escalate", (text) => ESCALATE.test(text)],
  ["human", (text) => HUMAN.test(text)],
  ["thanks", (text) => THANKS.test(text)],
  ["no", (text) => NO.test(text)],
  ["yes", (text) => YES.test(text) && !NEGATION.test(text)],
];

// "Nothing, forget it" to a question that asked them to type something.
const NOTHING_TO_ADD =
  /^\W*((nothing|forget it|never ?mind|nvm|kuch nahi|rehne do|chhodo|jaane do|no thanks|leave it)[\s,.!]*)+$/i;
// A no and nothing more ("no thanks", "nahi chahiye"); "no reminders" says what to.
const JUST_NO = /^\W*\S+(\s+(no|thanks?|thank you|sorry|please|pls|ji|now|for now|abhi|chahiye|nahi|na))*[\s.!]*$/i;
// Something went wrong with an order, which a person should read.
const COMPLAINT =
  /\b(refund|wrong|missing|late|damaged|spoil\w*|stale|sour|rotten|bad|worst|cancel\w*|complain\w*|problem|issue|unhappy|disappoint\w*|money|paisa|kharab)\b|खराब|गलत|शिकायत/i;

export const intent = (text: string): Intent => RULES.find(([, matches]) => matches(text))?.[0] ?? "other";

// Typed text or media that isn't a tap, in order (BOT.md §6): consent, "who is this", a legal threat, what the open
// question asked for, then a short yes/no as a tap or a nod. "ai" means none of that settles it: the AI answers when it's
// on (lib/ai.ts), else `fallbackReply`. `asked` is the last flow message; `aside` says the bot has said something else since
// (the AI, a handoff), so a "yes" or an "ok" answers that, not the flow's buttons.
export function read(text: string, media: boolean, flow?: Flow, asked?: Msg, aside = false): Read {
  const kind = intent(text);
  if (
    kind === "crisis" ||
    kind === "stop" ||
    kind === "wrong" ||
    kind === "start" ||
    kind === "who" ||
    kind === "escalate" ||
    kind === "human"
  )
    return { do: kind };
  // A photo, voice note or document: the flow's `received` node while it expects one, else a handoff.
  if (media) return asked && flow?.nodes.received ? { do: "node", node: "received" } : { do: "media" };
  if (asked?.typed)
    return NOTHING_TO_ADD.test(text) ? { do: "say", msg: REPLIES.nod } : { do: "node", node: asked.typed };
  // Typing an open option's own title ("send it over") is a tap, whatever the case or punctuation.
  const option = optionsOf(asked).find((o) => plain(o.title) === plain(text));
  if (option) return { do: "tap", option };
  // A longer message ("no, but send the Manchego") says more than yes or no: the AI reads it, and so does a no that says
  // what to ("no reminders" isn't a nod). A bare yes taps only a two-button yes/no question; with three options a "yes"
  // could mean either of the first two.
  const short = (kind === "yes" || (kind === "no" && JUST_NO.test(text))) && !aside && wordCount(text) <= 3;
  if (short) {
    const buttons = asked?.buttons;
    if (buttons && declines(buttons.at(-1)) && (kind === "no" || buttons.length === 2))
      return { do: "tap", option: kind === "yes" ? buttons[0] : buttons.at(-1)! };
    if (!optionsOf(asked).length) return { do: "say", msg: REPLIES.nod };
  }
  if (kind === "thanks" && !aside) return { do: "say", msg: REPLIES.thanks };
  return { do: "ai" };
}

// When the AI is off, fails, or its reply breaks a rule (`vet` in lib/guardrails.ts): a one-line answer, a nudge back to
// the open options for an answer that isn't a question or a complaint ("tomorrow between 5 and 6"), a nod, or a person.
// An outage shouldn't turn every choice into a ticket, nor leave a complaint unread.
export const fallbackReply = (text: string, asked?: Msg): Msg => {
  const kind = intent(text);
  const choosing = optionsOf(asked).length > 0 && !text.includes("?") && !COMPLAINT.test(text) && wordCount(text) <= 12;
  const answer = faq(text);
  if (answer) return answer;
  if (choosing) return REPLIES.nudge;
  if (kind === "yes" || kind === "no") return REPLIES.nod;
  if (kind === "thanks") return REPLIES.thanks;
  return REPLIES.handoff;
};

// Lower case, letters and digits only: "Today, 6-8 PM!" reads as "today 6 8 pm".
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const wordCount = (text: string) => text.trim().split(/\s+/).length;

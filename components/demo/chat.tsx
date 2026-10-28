// The chat as WhatsApp draws it: a message with its photo, list, link or reply buttons and carousel cards, and the
// bottom sheet a list opens. What a tap does is the page's (app/page.tsx).
import type { Msg, Option, Photo } from "@/lib/bot";
import { Icon } from "./icons";

// One message in the chat.
export type Item = {
  me?: boolean; // the customer's
  msg: Msg;
  quote?: string; // the message they tapped on, quoted above theirs
  time: string;
  src?: "ai" | "rule"; // not from the flow: the AI's answer, or one of the bot's own lines
};
// The bottom sheet: a list's rows, or a message's buttons when it has more than three, and the message they're on.
export type Sheet = { title: string; section?: string; options: Option[]; from: Msg };

// WhatsApp shows up to three reply buttons; with more, the first two and "See all options".
const MAX_REPLY_BUTTONS = 3;

// A list's or a link's button, inside the bubble under a divider.
const BUBBLE_ACTION =
  "-mx-2 mt-1.5 flex items-center justify-center gap-1.5 border-t border-black/10 pt-2 font-medium text-[#027eb5] disabled:opacity-50";
// A reply button, under the bubble.
const REPLY_BUTTON =
  "mt-0.5 flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 font-medium text-[#027eb5] shadow-sm disabled:opacity-60";

// The bot's own buttons, which stay live on older messages: the AI's suggested replies, and a card's Add to basket.
const isAsk = (option: Option) => option.next === "ask";
const isAdd = (option: Option) => option.next.startsWith("add:");

// WhatsApp's *bold* and _italic_, and its links (a card's product page) tappable.
function rich(text: string) {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_|https:\/\/\S+)/).map((part, i) => {
    if (i % 2 === 0) return part; // the plain text between matches
    if (part.startsWith("https://"))
      return (
        <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-[#027eb5] underline">
          {part}
        </a>
      );
    if (part[0] === "_") return <i key={i}>{part.slice(1, -1)}</i>;
    return <b key={i}>{part.slice(1, -1)}</b>;
  });
}

// A product's own photo from the catalogue, or an emoji stand-in where a message has none.
function Pic({ photo }: { photo: Photo }) {
  const { url, alt, emoji } = photo;
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the catalogue's CDN images, any size: next/image would need each host configured
      <img src={url} alt={alt} loading="lazy" className="aspect-[4/3] w-full rounded-md bg-white object-contain" />
    );
  return (
    <div
      role="img"
      aria-label={`Photo: ${alt}`}
      className="relative grid aspect-[16/10] place-items-center rounded-md bg-linear-to-br from-[#f6ead8] to-[#dfc29a] text-6xl"
    >
      {emoji}
      <span className="absolute inset-x-2 bottom-1.5 truncate text-[11px] text-[#5c4a32]">Photo · {alt}</span>
    </div>
  );
}

// The bubble's tail, on the side it came from.
function Tail({ mine }: { mine?: boolean }) {
  return (
    <svg
      viewBox="0 0 8 13"
      aria-hidden="true"
      className={`absolute top-0 h-[13px] w-2 ${mine ? "-right-2 text-[#d9fdd3]" : "-left-2 text-white"}`}
    >
      <path
        fill="currentColor"
        d={
          mine
            ? "M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z"
            : "M1.533 2.568 8 11.193V0H2.812C1.042 0 .474 1.156 1.533 2.568z"
        }
      />
    </svg>
  );
}

// The stress test's note under a bot message: what the bot checks before it plays, and what it does.
function BotNote({ msg }: { msg: Msg }) {
  return (
    <p
      role="note"
      aria-label="What the bot does"
      className="mt-1 rounded-md bg-[#fff3cd] px-2 py-1 text-[11px] leading-snug text-[#7a5a00]"
    >
      {msg.needs && (
        <>
          🔎 Bot checks first: {msg.needs.what}. If not, it plays “{msg.needs.else}”.{" "}
        </>
      )}
      {msg.bot && <>🤖 {msg.bot}</>}
    </p>
  );
}

type CardsProps = {
  cards: NonNullable<Msg["cards"]>;
  typing: boolean;
  closed: boolean;
  onReply: (option: Option, from: Msg) => void;
};

// A carousel: each card's photo, text and buttons.
function Cards({ cards, typing, closed, onReply }: CardsProps) {
  return (
    <div className="-mx-3 mt-1 flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3 pb-1">
      {cards.map((card) => (
        <div key={card.text} className="flex w-60 shrink-0 snap-start flex-col rounded-lg bg-white p-1 shadow-sm">
          <Pic photo={card.photo} />
          <p className="flex-1 whitespace-pre-wrap px-1.5 pb-2 pt-1.5">{rich(card.text)}</p>
          {card.buttons.map((option) => (
            <button
              key={option.title}
              disabled={typing || (closed && !isAdd(option))}
              onClick={() => onReply(option, { text: card.text })}
              className="-mx-1 flex items-center justify-center gap-1.5 border-t border-black/10 py-2 font-medium text-[#027eb5] disabled:opacity-50"
            >
              <Icon name="reply" className="size-4" />
              {option.title}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

type MessageProps = {
  item: Item;
  firstInRun: boolean; // the first of a run from one side, so it gets the bubble's tail
  closed: boolean; // not the newest flow message, whose options are closed (WhatsApp keeps only the newest open)
  typing: boolean;
  stress: boolean; // the stress test: show what the bot checks and does
  onReply: (option: Option, from: Msg) => void;
  onSheet: (title: string, options: Option[], from: Msg, section?: string) => void;
};

// One message: its bubble, its reply buttons and carousel, and in the stress test, what the bot checks and does.
export function Message({ item, firstInRun, closed, typing, stress, onReply, onSheet }: MessageProps) {
  const { msg } = item;
  const { list } = msg;
  const buttons = msg.buttons ?? [];
  const overflow = buttons.length > MAX_REPLY_BUTTONS;
  // The time sits on the text's last line, as in WhatsApp: an invisible copy of it at the end of the text keeps that
  // line clear.
  const stamp = (
    <>
      {item.time}
      {item.me && <Icon name="ticks" className="size-4 text-[#53bdeb]" />}
    </>
  );
  const stampSpace = (
    <span aria-hidden="true" className="invisible ml-2 inline-flex gap-0.5 text-[11px]">
      {stamp}
    </span>
  );
  return (
    <div
      className={`flex flex-col ${msg.cards ? "w-full" : "max-w-[85%]"} ${item.me ? "self-end" : "self-start"} ${firstInRun ? "mt-3" : "mt-0.5"}`}
    >
      <div
        className={`relative rounded-lg px-2 pb-1.5 pt-1.5 shadow-sm ${msg.cards ? "max-w-[85%] self-start" : ""} ${item.me ? "bg-[#d9fdd3]" : "bg-white"} ${firstInRun ? (item.me ? "rounded-tr-none" : "rounded-tl-none") : ""}`}
      >
        {firstInRun && <Tail mine={item.me} />}
        {item.quote && (
          <div className="mb-1 rounded-md border-l-4 border-[#06cf9c] bg-black/5 px-2 py-1 text-[13px]">
            <p className="font-medium text-[#06cf9c]">FoodStories</p>
            <p className="line-clamp-2 text-[#667781]">{item.quote.replace(/[*_]/g, "")}</p>
          </div>
        )}
        {msg.photo && (
          <div className="-mx-1 -mt-0.5 mb-1.5">
            <Pic photo={msg.photo} />
          </div>
        )}
        <div className="relative">
          {msg.header && <p className="font-bold">{msg.header}</p>}
          <p className="whitespace-pre-wrap">
            {rich(msg.text)}
            {!msg.footer && stampSpace}
          </p>
          {msg.footer && (
            <p className="text-[13px] text-[#667781]">
              {msg.footer}
              {stampSpace}
            </p>
          )}
          <span className="absolute -bottom-0.5 right-0 flex items-center gap-0.5 text-[11px] text-[#667781]">
            {stamp}
          </span>
        </div>
        {list && (
          <button
            disabled={closed}
            onClick={() => onSheet(list.button, list.rows, msg, list.section)}
            className={`${BUBBLE_ACTION} w-[calc(100%_+_1rem)]`}
          >
            <Icon name="list" className="size-5" />
            {list.button}
          </button>
        )}
        {msg.link && (
          <a href={msg.link.url} target="_blank" rel="noreferrer" className={BUBBLE_ACTION}>
            <Icon name="link" className="size-[18px]" />
            {msg.link.label}
          </a>
        )}
      </div>
      {(overflow ? buttons.slice(0, MAX_REPLY_BUTTONS - 1) : buttons).map((option) => (
        <button
          key={option.title}
          disabled={typing || (closed && !(isAsk(option) || isAdd(option)))}
          onClick={() => onReply(option, msg)}
          className={REPLY_BUTTON}
        >
          <Icon name="reply" className="size-4" />
          {option.title}
        </button>
      ))}
      {overflow && (
        <button disabled={closed} onClick={() => onSheet("All options", buttons, msg)} className={REPLY_BUTTON}>
          <Icon name="list" className="size-4" />
          See all options
        </button>
      )}
      {stress && !item.me && (msg.needs || msg.bot) && <BotNote msg={msg} />}
      {msg.cards && <Cards cards={msg.cards} typing={typing} closed={closed} onReply={onReply} />}
    </div>
  );
}

type OptionSheetProps = {
  sheet: Sheet;
  picked: Option | null;
  onPick: (option: Option) => void;
  onClose: () => void;
  onSend: (option: Option, from: Msg) => void;
};

// A list's rows, or a message's buttons when it has more than three: pick one, then Send.
export function OptionSheet({ sheet, picked, onPick, onClose, onSend }: OptionSheetProps) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={sheet.title}
        className="rounded-t-2xl bg-white pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-black/10 px-3 py-3">
          <button onClick={onClose} aria-label="Close" className="text-[#54656f]">
            <Icon name="close" />
          </button>
          <p className="flex-1 pr-6 text-center font-medium">{sheet.title}</p>
        </div>
        {sheet.section && <p className="px-5 pb-1 pt-3 text-sm font-medium text-[#008069]">{sheet.section}</p>}
        {sheet.options.map((option) => (
          <label key={option.title} className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-[#f5f6f6]">
            <span className="flex-1">
              <span className="block">{option.title}</span>
              {option.description && <span className="block text-[13px] text-[#667781]">{option.description}</span>}
            </span>
            <input
              type="radio"
              name="option"
              checked={picked === option}
              onChange={() => onPick(option)}
              className="size-5 accent-[#008069]"
            />
          </label>
        ))}
        <div className="px-4 pt-3">
          <button
            disabled={!picked}
            onClick={() => picked && onSend(picked, sheet.from)}
            className="w-full rounded-full bg-[#008069] py-2.5 font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

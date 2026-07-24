import type { StickerPack } from "@/types";

/**
 * The editor's sticker library. Every glyph is a plain emoji so it renders
 * offline and bakes into the canvas composite with the system emoji font — no
 * image assets, no network. The first pack ("Featured") is filled at runtime
 * from the active theme's stickers; the rest are evergreen categories and
 * seasonal sets the host can reach via the pack tabs.
 */
export const STICKER_PACKS: StickerPack[] = [
  {
    id: "cute",
    name: "Cute",
    tab: "🎀",
    glyphs: ["🎀", "💖", "⭐", "🌸", "🧸", "🍓", "☁️", "🌈", "✨", "🍡", "🐰", "💐", "🫶", "🩷", "🦄", "🌷"],
  },
  {
    id: "love",
    name: "Love",
    tab: "💕",
    glyphs: ["❤️", "💕", "💗", "💓", "💞", "💘", "💝", "💟", "😍", "😘", "🥰", "💌", "💋", "🌹", "💒", "💑"],
  },
  {
    id: "party",
    name: "Party",
    tab: "🥳",
    glyphs: ["🥳", "🎉", "🎊", "🎈", "🎁", "🍾", "🥂", "🪩", "🎆", "🎇", "🕺", "💃", "🎵", "🎶", "🔥", "💯"],
  },
  {
    id: "faces",
    name: "Faces",
    tab: "😎",
    glyphs: ["😎", "🤩", "😜", "😝", "🤪", "😇", "🥹", "😊", "🙃", "😏", "🤗", "😌", "🥺", "😳", "🤭", "😆"],
  },
  {
    id: "animals",
    name: "Animals",
    tab: "🐶",
    glyphs: ["🐶", "🐱", "🐰", "🐻", "🐼", "🦊", "🐨", "🐯", "🦁", "🐸", "🐵", "🐧", "🦋", "🐝", "🐢", "🦉"],
  },
  {
    id: "food",
    name: "Food",
    tab: "🍕",
    glyphs: ["🍕", "🍔", "🍟", "🌮", "🍦", "🍩", "🍪", "🧁", "🍰", "🍫", "🍬", "🍭", "🍉", "🍓", "🧋", "☕"],
  },
  {
    id: "sparkle",
    name: "Sparkle",
    tab: "✨",
    glyphs: ["✨", "⭐", "🌟", "💫", "⚡", "🌈", "🔮", "💎", "👑", "🏆", "🎯", "🚀", "🌙", "☀️", "🪐", "❄️"],
  },
  {
    id: "speech",
    name: "Words",
    tab: "💬",
    glyphs: ["💬", "❤️‍🔥", "💯", "🆒", "🆗", "👍", "👌", "🤞", "✌️", "🤟", "👏", "🙌", "💪", "🫶", "👀", "💅"],
  },
  {
    id: "valentines",
    name: "Valentine's",
    tab: "💘",
    seasonal: true,
    glyphs: ["💘", "💝", "❤️", "🌹", "🍫", "💋", "😍", "🥰", "💕", "💖", "🧸", "🎀", "💌", "🍓", "🩷", "🫶"],
  },
  {
    id: "halloween",
    name: "Halloween",
    tab: "🎃",
    seasonal: true,
    glyphs: ["🎃", "👻", "🦇", "🕷️", "🕸️", "🧛", "🧟", "💀", "☠️", "🍬", "🍭", "🕯️", "🌙", "🧙", "🪦", "😈"],
  },
  {
    id: "christmas",
    name: "Christmas",
    tab: "🎄",
    seasonal: true,
    glyphs: ["🎄", "🎅", "🤶", "⛄", "❄️", "🎁", "🦌", "🔔", "⭐", "🕯️", "🍪", "🧦", "🌟", "🎀", "☃️", "🎶"],
  },
  {
    id: "newyear",
    name: "New Year",
    tab: "🎆",
    seasonal: true,
    glyphs: ["🎆", "🎇", "🥂", "🍾", "🎉", "🎊", "⏰", "🕛", "✨", "🪩", "🎈", "💫", "🥳", "🌟", "💛", "🔢"],
  },
  {
    id: "summer",
    name: "Summer",
    tab: "🌴",
    seasonal: true,
    glyphs: ["🌴", "🏖️", "☀️", "🌊", "🍦", "🕶️", "🩴", "🏄", "🐚", "🍉", "🌺", "🍹", "⛱️", "🐠", "🌞", "✈️"],
  },
];

export const STICKER_PACK_BY_ID = (id: string): StickerPack =>
  STICKER_PACKS.find((p) => p.id === id) ?? STICKER_PACKS[0];

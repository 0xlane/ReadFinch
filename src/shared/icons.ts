import names from "./icon-names.json";
export const legacyIcons = [
  "languages",
  "book",
  "pen",
  "sparkles",
  "align",
  "code",
  "lightbulb",
  "scan",
] as const;
export const iconSets = ["tabler", "ri", "streamline-color"] as const;
export type IconSet = (typeof iconSets)[number];
export const setLabels: Record<IconSet, string> = {
  tabler: "Tabler",
  ri: "Remix",
  "streamline-color": "Streamline",
};
export const catalogIcons = iconSets.flatMap((set) =>
  names[set].map((name) => set + ":" + name),
);
const positions = new Map<string, { set: IconSet; index: number }>();
for (const set of iconSets)
  names[set].forEach((name, index) =>
    positions.set(set + ":" + name, { set, index }),
  );
export function iconPosition(id: string) {
  return positions.get(id);
}
export const featuredIcons = [
  ["book-2", "书籍"],
  ["bookmark", "书签"],
  ["pencil", "铅笔"],
  ["sparkles", "星光"],
  ["language-hiragana", "语言"],
  ["search", "搜索"],
  ["settings", "设置"],
  ["bulb", "灯泡"],
  ["brain", "大脑"],
  ["star", "星星"],
  ["heart", "爱心"],
  ["message-circle", "对话"],
  ["notes", "笔记"],
  ["file-text", "文档"],
  ["flag", "旗帜"],
  ["clock", "时钟"],
  ["calendar", "日历"],
  ["bolt", "闪电"],
  ["compass", "指南针"],
  ["palette", "调色板"],
  ["feather", "羽毛"],
  ["device-laptop", "电脑"],
  ["school", "学校"],
  ["microscope", "显微镜"],
  ["atom-2", "原子"],
  ["target-arrow", "目标"],
  ["world", "地球"],
  ["link", "链接"],
  ["tags", "标签"],
  ["wand", "魔杖"],
].map(([id, zh]) => ({ id: "tabler:" + id, zh }));
export const defaultIconId: Record<(typeof legacyIcons)[number], string> = {
  book: "streamline-color:dictionary-language-book-flat",
  pen: "streamline-color:ai-edit-spark-flat",
  languages: "ri:translate",
  scan: "tabler:zoom-scan",
  sparkles: "tabler:sparkles",
  align: "tabler:align-left",
  code: "tabler:code",
  lightbulb: "tabler:bulb",
};

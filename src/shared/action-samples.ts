import type { OutputSample } from "./action-output";
import type { TemplateId } from "./action-templates";
import { resultLanguageCode } from "./languages";
const copy: Record<
  string,
  {
    definition: string;
    sentence: string;
    memory: string;
    observation: string;
    subject: string;
    modifier: string;
    predicate: string;
    setting: string;
    correction: string;
    summary: string;
  }
> = {
  "zh-CN": {
    definition: "花；花朵（尤指果树的花）",
    sentence: "樱花短暂的美丽提醒我们珍惜每一刻。",
    memory: "blossom 常指树上的花；可以把词语和春天开花的果树联系起来。",
    observation: "仔细记录的细微观察，有时会带来意想不到的发现。",
    subject: "句子的核心主语。",
    modifier: "过去分词短语修饰 observations。",
    predicate: "表达可能的结果。",
    setting: "日常叙述 · 中性语体",
    correction: "第三人称单数主语对应 goes。",
    summary: "主语和动词现在在人称与数上一致。",
  },
  "zh-TW": {
    definition: "花；花朵（尤指果樹的花）",
    sentence: "櫻花短暫的美麗提醒我們珍惜每一刻。",
    memory: "blossom 常指樹上的花；可以把這個詞和春天開花的果樹連結起來。",
    observation: "仔細記錄的細微觀察，有時會帶來意想不到的發現。",
    subject: "句子的核心主詞。",
    modifier: "過去分詞片語修飾 observations。",
    predicate: "表達可能的結果。",
    setting: "日常敘述 · 中性語體",
    correction: "第三人稱單數主詞搭配 goes。",
    summary: "主詞和動詞現在在人稱與數上一致。",
  },
  en: {
    definition: "A flower, especially one on a fruit tree.",
    sentence:
      "The brief beauty of cherry blossoms reminds us to value every moment.",
    memory:
      "Blossom often refers to flowers on a tree. Picture a fruit tree flowering in spring.",
    observation:
      "Small observations, when carefully recorded, may lead to surprising discoveries.",
    subject: "The main subject of the sentence.",
    modifier: "A past participle phrase modifying observations.",
    predicate: "Expresses a possible result.",
    setting: "Everyday narration · Neutral register",
    correction: "The third-person singular subject takes goes.",
    summary: "The subject and verb now agree in person and number.",
  },
  ja: {
    definition: "花。特に果樹に咲く花。",
    sentence:
      "桜の花のはかない美しさは、一瞬一瞬を大切にすることを思い出させてくれる。",
    memory:
      "blossom は木に咲く花によく使われる。春に花を咲かせる果樹を思い浮かべると覚えやすい。",
    observation:
      "小さな観察も、丁寧に記録すれば思いがけない発見につながることがある。",
    subject: "文の中心となる主語。",
    modifier: "observations を修飾する過去分詞句。",
    predicate: "起こり得る結果を表す。",
    setting: "日常的な叙述 · 中立的な文体",
    correction: "主語が三人称単数なので goes を使う。",
    summary: "主語と動詞の人称・数の一致を修正した。",
  },
  ko: {
    definition: "꽃. 특히 과일나무에 피는 꽃.",
    sentence: "벚꽃의 덧없는 아름다움은 매 순간을 소중히 여기도록 일깨워 준다.",
    memory:
      "blossom은 주로 나무에 피는 꽃을 가리킨다. 봄에 꽃이 핀 과일나무를 떠올려 보자.",
    observation:
      "작은 관찰도 꼼꼼하게 기록하면 뜻밖의 발견으로 이어질 수 있다.",
    subject: "문장의 핵심 주어.",
    modifier: "observations를 수식하는 과거분사구.",
    predicate: "일어날 수 있는 결과를 나타낸다.",
    setting: "일상적인 서술 · 중립적인 문체",
    correction: "주어가 3인칭 단수이므로 goes를 쓴다.",
    summary: "주어와 동사의 인칭 및 수를 일치시켰다.",
  },
  fr: {
    definition: "Une fleur, notamment celle d’un arbre fruitier.",
    sentence:
      "La beauté éphémère des fleurs de cerisier nous rappelle de savourer chaque instant.",
    memory:
      "Blossom désigne souvent les fleurs d’un arbre. Imaginez un arbre fruitier en fleurs au printemps.",
    observation:
      "De petites observations, soigneusement consignées, peuvent mener à des découvertes inattendues.",
    subject: "Le sujet principal de la phrase.",
    modifier: "Un groupe participial qui qualifie observations.",
    predicate: "Exprime un résultat possible.",
    setting: "Récit quotidien · Registre neutre",
    correction: "Le sujet à la troisième personne du singulier exige goes.",
    summary:
      "Le sujet et le verbe s’accordent désormais en personne et en nombre.",
  },
  de: {
    definition: "Eine Blüte, besonders die eines Obstbaums.",
    sentence:
      "Die vergängliche Schönheit der Kirschblüten erinnert uns daran, jeden Augenblick zu schätzen.",
    memory:
      "Blossom bezeichnet oft die Blüten eines Baums. Stell dir einen blühenden Obstbaum im Frühling vor.",
    observation:
      "Sorgfältig festgehaltene kleine Beobachtungen können zu unerwarteten Entdeckungen führen.",
    subject: "Das Hauptsubjekt des Satzes.",
    modifier: "Eine Partizipialgruppe, die observations näher bestimmt.",
    predicate: "Drückt ein mögliches Ergebnis aus.",
    setting: "Alltägliche Erzählung · Neutraler Stil",
    correction: "Das Subjekt in der dritten Person Singular verlangt goes.",
    summary: "Subjekt und Verb stimmen jetzt in Person und Numerus überein.",
  },
  es: {
    definition: "Una flor, especialmente la de un árbol frutal.",
    sentence:
      "La belleza efímera de las flores de cerezo nos recuerda que debemos valorar cada momento.",
    memory:
      "Blossom suele referirse a las flores de un árbol. Imagina un árbol frutal en flor durante la primavera.",
    observation:
      "Las pequeñas observaciones, registradas con cuidado, pueden conducir a descubrimientos inesperados.",
    subject: "El sujeto principal de la oración.",
    modifier: "Un grupo de participio que modifica observations.",
    predicate: "Expresa un resultado posible.",
    setting: "Narración cotidiana · Registro neutro",
    correction: "El sujeto en tercera persona del singular requiere goes.",
    summary: "El sujeto y el verbo ahora concuerdan en persona y número.",
  },
};
export function localizedSample(
  kind: TemplateId,
  targetLanguage: string,
  explanationLanguage = targetLanguage,
): OutputSample {
  const target = copy[resultLanguageCode(targetLanguage)] ?? copy.en,
    explain = copy[resultLanguageCode(explanationLanguage)] ?? copy.en;
  const selection =
    kind === "dictionary"
      ? "blossom"
      : kind === "polish"
        ? "She go to the library every week."
        : "Small observations, carefully recorded, can lead to unexpected discoveries.";
  const values: OutputSample["values"] =
    kind === "dictionary"
      ? {
          "dictionary-term": "blossom",
          "dictionary-phonetic": "/ˈblɒs.əm/",
          "dictionary-part-of-speech": "noun",
          "dictionary-definition": explain.definition,
          "dictionary-context":
            "The ephemeral beauty of cherry blossoms reminds us to cherish each moment.",
          "dictionary-context-term": '[{"text":"blossoms"}]',
          "dictionary-context-translation": explain.sentence,
          "dictionary-memory-tips": explain.memory,
          "dictionary-difficulty": "B2",
        }
      : kind === "sentence"
        ? {
            "sentence-analysis-annotations": JSON.stringify([
              {
                text: "Small observations",
                type: "subject",
                note: explain.subject,
              },
              {
                text: "carefully recorded",
                type: "attributive",
                note: explain.modifier,
              },
              {
                text: "can lead to",
                type: "predicate",
                note: explain.predicate,
              },
            ]),
            "sentence-analysis-translation": target.observation,
          }
        : kind === "polish"
          ? {
              "improve-writing-setting": explain.setting,
              "improve-writing-annotations": JSON.stringify([
                {
                  text: "go",
                  replacement: "goes",
                  note: explain.correction,
                  type: "grammar",
                  tier: "error",
                },
              ]),
              "improve-writing-improved": "She goes to the library every week.",
              "improve-writing-summary": explain.summary,
            }
          : { result: target.observation };
  return { selection, targetLanguage, explanationLanguage, values };
}

import { normalizeQuestion } from "./questions.js";
import { parseCourseJSON } from "./course-generation.js";
import { atContentPath, contentError } from "./generation-validation.js";
import { learningContext } from "./learning-mode.js";

const task = (
  id,
  unitIndex,
  title,
  prompt,
  referenceAnswer,
  criteria,
  type = "response",
) => ({
  id,
  unitIndex,
  title,
  prompt,
  referenceAnswer,
  criteria,
  type,
  minutes: type === "code" ? 15 : 8,
});

// These application tasks have their own answers and records. Lecture quizzes
// and in-sequence checkpoints never supply this bank.
const python = [
  {
    ...task(
      "py-total-fill",
      0,
      "补全结账计算",
      '单价文本为 "12.5"，数量为 3。补全两处结果：float("12.5") 的值是 ___；乘以数量后，总价是 ___。',
      "先把文本转换为数值 12.5，再乘以 3 得到总价 37.5。",
      ["正确转换数值", "正确计算总价"],
      "fill",
    ),
    blanks: [
      { label: "转换后的单价", answers: ["12.5", "12.50"] },
      { label: "总价", answers: ["37.5", "37.50"] },
    ],
    minutes: 3,
  },
  {
    ...task(
      "py-list-judgment",
      0,
      "判断一份清单是否被修改",
      "原列表 prices = [12, 25, 8]。执行 prices[0] = 10 后，prices 本身仍然保持原值不变。这个说法正确吗？",
      "错误。按索引赋值会修改列表本身，执行后 prices 变为 [10, 25, 8]。若需要保留原价，应单独创建结果列表。",
      ["识别列表元素赋值的作用"],
      "true_false",
    ),
    answer: false,
    minutes: 3,
  },
  task(
    "py-type-reason",
    0,
    "解释一次计算异常",
    "朋友把 input() 得到的数量直接与单价 12.5 相乘，却没有得到总价。用两三句话解释问题出在哪，并给出转换输入的方案。",
    "input() 返回文本，金额计算需要数值。若数量限定为整数，可以用 int(input()) 转换后乘以 12.5；还需考虑输入无法转换的情况。仅修改变量名称不会改变数据类型。",
    [
      "指出 input 返回文本",
      "说明转换为合适的数值类型",
      "用自己的话解释类型对运算的影响",
    ],
  ),
  {
    ...task(
      "py-receipt",
      0,
      "修复一张收银小票",
      '商店收到价格字符串 "12.5"，顾客买 3 件。哪段代码能得到数值总价 37.5？选出后对照解析理解原因。',
      "float() 将价格文本转换为数值，再乘以数量。直接重复字符串不会计算金额。",
      ["区分文本重复与数值乘法"],
    ),
    type: "choice",
    options: ['"12.5" * 3', 'float("12.5") * 3', 'int("12.5") * 3'],
    answer: 1,
    minutes: 4,
  },
  task(
    "py-discount",
    0,
    "为购物清单计算折扣",
    "给定 prices = [12, 25, 8]。写程序：只给不低于 10 元的商品打九折，输出折后清单和总价；不修改原列表。",
    "```python\nprices = [12, 25, 8]\ndiscounted = []\nfor price in prices:\n    discounted.append(price * 0.9 if price >= 10 else price)\nprint(discounted)  # [10.8, 22.5, 8]\nprint(round(sum(discounted), 2))  # 41.3\n```\n单独建立结果列表，可保留原始价格供后续核对。",
    ["按价格条件决定是否打折", "保留原始列表", "得到总价 41.3"],
    "code",
  ),
  task(
    "py-report",
    1,
    "把消费记录变成可复用的报告",
    "实现 summarize(records) 函数。records 是包含 name、amount 字段的字典列表。函数返回总金额和最大消费的名称；空列表返回 (0, None)。写出普通输入和空输入的验证示例。",
    "```python\ndef summarize(records):\n    if not records:\n        return 0, None\n    total = sum(r['amount'] for r in records)\n    largest = max(records, key=lambda r: r['amount'])\n    return total, largest['name']\n\nassert summarize([]) == (0, None)\nassert summarize([{'name': '书', 'amount': 30}, {'name': '笔', 'amount': 5}]) == (35, '书')\n```",
    [
      "使用函数返回结果，而非只打印",
      "正确处理空输入",
      "提供正常与边界输入的验证",
    ],
    "code",
  ),
];
const linear = [
  {
    ...task(
      "la-direction-check",
      0,
      "搬动箭头后还是同一个位移吗",
      "一个位移箭头整体向右平移，但方向和长度均未改变。它表示的自由向量也随之改变了。判断这个说法。",
      "错误。自由向量由方向和长度决定，整体平移不改变这两个量，因此仍表示同一个自由向量。",
      ["区分向量与箭头起点"],
      "true_false",
    ),
    answer: false,
  },
  {
    ...task(
      "la-point-fill",
      1,
      "补全变换后的位置",
      "变换 A=[[2,0],[0,1]] 作用于点 (3,2)。变换后的横坐标是 ___，纵坐标是 ___。",
      "横向乘以 2、纵向不变，所以变换后的点是 (6,2)。",
      ["读出横纵缩放关系"],
      "fill",
    ),
    blanks: [
      { label: "横坐标", answers: ["6", "6.0"] },
      { label: "纵坐标", answers: ["2", "2.0"] },
    ],
  },
  task(
    "la-route",
    0,
    "把配送路线翻译成向量",
    "仓库为原点，向东为 x 正方向、向北为 y 正方向。快递员先向东 3 公里、向北 2 公里，再向西 1 公里、向北 4 公里。写出两段位移、合位移和最终位置；说明总路程是否等于合位移的长度。",
    "两段位移是 (3, 2) 与 (-1, 4)，相加得到 (2, 6)，所以最终位置为 (2, 6)。按题中四段路线行走，总路程为 10 公里；合位移长度为 √40 公里。路程累计实际行走长度，位移只取决于起终点。",
    ["分别写出位移并按坐标相加", "区分路程与位移长度"],
  ),
  task(
    "la-basis",
    0,
    "换一套坐标描述同一个位置",
    "取基向量 b₁=(1,1)、b₂=(1,-1)。点 v=(4,2) 在这套基底下的坐标是什么？写出组合验证，并说明为什么 (2,2) 与 (4,4) 不能一起作为二维空间的基。",
    "v = 3b₁ + b₂ = (4,2)，因此新坐标为 (3,1)。(2,2) 与 (4,4) 共线，不能张成整个二维平面；基需要线性无关且能张成空间。",
    ["求出新坐标 (3,1)", "代回向量组合验证", "用线性无关解释基底要求"],
  ),
  task(
    "la-transform",
    1,
    "设计一次图形变换",
    "一张图先经过 A=[[2,0],[0,1]]，再经过 B=[[0,-1],[1,0]]。求点 (1,2) 的最终位置；如果交换顺序，结果是否相同？写出两条计算路径。",
    "先 A 后 B：(1,2) → (2,2) → (-2,2)，组合矩阵为 BA。先 B 后 A：(1,2) → (-2,1) → (-4,1)。两者不同，说明矩阵乘法通常不可交换。",
    ["正确区分先后顺序和 BA", "算出两条路径的结果", "解释不可交换性"],
  ),
  task(
    "la-area",
    2,
    "判断变换后的面积与方向",
    "变换矩阵 A=[[2,0],[0,-3]] 作用于面积为 4 的图形。新面积是多少？方向是否翻转？再解释为什么 det(A)=0 时不能恢复原图中的所有信息。",
    "det(A)=-6，面积乘以绝对值 6，得到 24。负号表示定向翻转。行列式为零时，至少一个空间方向被压缩丢失，变换不再一一对应，无法唯一恢复原图。",
    ["区分行列式符号与绝对值", "算出新面积 24", "解释不可逆与信息丢失的关系"],
  ),
];
const ai = [
  {
    ...task(
      "ai-evidence-check",
      1,
      "流畅回答就足以作为证据吗",
      "AI 的回答逻辑连贯、措辞专业，因此不必检查它列出的引用是否真实存在。判断这个说法。",
      "错误。语言流畅不保证事实可靠，引用可能不存在或不支持结论，应核实来源与论点之间的支持关系。",
      ["区分表达质量与证据可靠性"],
      "true_false",
    ),
    answer: false,
  },
  task(
    "ai-data",
    0,
    "为一个识别模型检查数据",
    "你要训练识别猫狗的模型，训练图片中猫几乎都在室内、狗几乎都在草地上。设计一次测试，区分模型学到的是动物特征还是背景线索，并提出一项数据改进。",
    "建立独立测试集，覆盖室内狗、草地猫及原有组合，分别比较各组错误。只换背景、保持动物主体的对照也能帮助发现问题。补充背景多样且标签可靠的图片，避免背景与类别绑定；测试集不混入训练集。",
    [
      "设计能区分两种假设的对照",
      "避免训练测试数据泄漏",
      "提出针对背景偏差的数据改进",
    ],
  ),
  task(
    "ai-verify",
    1,
    "给 AI 的回答做一份核查计划",
    "AI 为一篇学习报告提供了三条看似专业的引用，但你还未打开来源。写出从确认来源存在，到判断来源是否支持结论的核查步骤；如果找不到来源，你会如何处理报告中的说法？",
    "先检索原文并核对作者、标题、时间和发布机构，再阅读与论点相关的上下文，确认来源确实支持结论而非只提到相同关键词。重要论断交叉验证；无法查证时明确标为未核实、删去引用或收窄结论，不将流畅表达视作可靠证据。",
    ["核验来源真实性", "核对原文与论点的支持关系", "明确处理无法验证的结论"],
  ),
];
const learning = [
  task(
    "study-plan",
    0,
    "把重读笔记改成一周学习计划",
    "你周一学完一个新概念，周末要用它解决问题。制定周一至周日的复习安排，包含主动回忆、反馈与至少两次间隔复习；说明如何根据错误调整计划。",
    "周一合上笔记复述概念并做一个小题，对照资料纠错；周三不看笔记再次回忆并换情境练习；周六做混合题，记录仍不清楚的关联；周日复盘错因并补练。间隔可随难度调整；反复错误的点应缩短间隔并补前置知识，而非只增加重读时长。",
    ["主动提取而非只重读", "安排间隔复习与反馈", "根据错误调整策略"],
  ),
];

const banks = {
  python,
  "linear-algebra": linear,
  "how-ai-works": ai,
  "ai-practice": [
    task(
      "ai-context",
      0,
      "检查一段对话中的指代",
      "对话先提到小林借给小陈一本书，随后说‘他下周归还’。分析这里的‘他’指谁、模型需要哪些上下文线索；再设计一个可能导致歧义的改写，并说明该如何澄清。",
      "按借阅关系，归还的人通常是借入方小陈；但不能只凭最近的人名就断定。若改为‘小林和小陈讨论了那本书，他下周归还’，上下文缺少借阅关系，应询问谁借走了书。模型利用上下文关联预测，合理推断仍不等于事实核实。",
      [
        "结合语义关系解释指代",
        "识别歧义并提出澄清问题",
        "区分上下文推断与事实核实",
      ],
    ),
    ...ai.filter((p) => p.unitIndex === 1),
  ],
  cognitive: learning,
  "study-science": learning,
};
export const practiceComplete = (attempt) =>
  ["correct", "reviewed"].includes(attempt?.status);
export function coursePractices(course, state) {
  // Do not attach a catalog bank to a replaced or reordered unit.
  const signature = (unit) => unit.lessons.map((l) => l.id).join("/");
  const expected = {
    python: ["py-values/py-list", "py-function/py-data"],
    "linear-algebra": [
      "vectors/basis",
      "matrices/composition",
      "determinant/eigenvectors",
    ],
    "how-ai-works": ["ai-pattern/ai-token", "ai-attention/ai-reliable"],
    "ai-practice": ["ai-token/ai-attention", "ai-reliable"],
    cognitive: ["memory/attention"],
    "study-science": ["memory/attention"],
  };
  const builtin = (banks[course.id] || []).filter(
    (p) =>
      signature(course.units[p.unitIndex] || { lessons: [] }) ===
      expected[course.id]?.[p.unitIndex],
  );
  const saved = (state.coursePractices?.[course.id] || []).filter(
    (p) => course.units[p.unitIndex]?.title === p.unitTitle,
  );
  return [...builtin, ...saved];
}

export function validatePractice(text, course, unitIndex, existing = []) {
  const value = parseCourseJSON(text);
  const textValue = (v) => typeof v === "string" && !!v.trim();
  const normalize = (v) => v.replace(/\s|[\p{P}\p{S}]/gu, "").toLowerCase();
  const questions = new Set(
    [
      ...course.units.flatMap((u) =>
        u.lessons.flatMap((l) => [
          l.quiz?.question,
          ...(l.teaching?.steps || []).map((s) => s.checkpoint?.question),
        ]),
      ),
      ...existing.map((p) => p.prompt),
    ]
      .filter(textValue)
      .map(normalize),
  );
  if (!Array.isArray(value?.items) || !value.items.length)
    throw contentError("/items", "items 中缺少独立练习。");
  return value.items.map((p, index) =>
    atContentPath(`/items/${index}`, () => {
      if (
        !["choice", "true_false", "fill", "response", "code"].includes(
          p?.type,
        ) ||
        ![p.title, p.prompt, p.referenceAnswer].every(textValue) ||
        !Array.isArray(p.criteria) ||
        !p.criteria.length ||
        !p.criteria.every(textValue)
      )
        throw new Error(
          "每题需要有效 type、title、prompt、referenceAnswer 和 criteria。",
        );
      if (questions.has(normalize(p.prompt)))
        throw new Error("题目与已有练习或随堂问答重复，请设计新的应用情境。");
      questions.add(normalize(p.prompt));
      const { question, explanation, ...fields } = normalizeQuestion({
        ...p,
        question: p.prompt,
        explanation: p.referenceAnswer,
      });
      return {
        id: crypto.randomUUID(),
        unitIndex,
        unitTitle: course.units[unitIndex].title,
        title: p.title.trim(),
        prompt: p.prompt.trim(),
        type: p.type,
        referenceAnswer: p.referenceAnswer.trim(),
        criteria: p.criteria.map((s) => s.trim()),
        minutes:
          Number.isFinite(p.minutes) && p.minutes > 0
            ? Math.max(1, Math.round(p.minutes))
            : 10,
        ...fields,
      };
    }),
  );
}

export async function requestCoursePractice(
  request,
  course,
  unitIndex,
  existing,
  signal,
) {
  const unit = course.units[unitIndex];
  const messages = [
    {
      role: "user",
      content: JSON.stringify({
        course: course.title,
        description: course.description,
        ...learningContext(course),
        unit: {
          title: unit.title,
          lessons: unit.lessons.map((l) => ({
            title: l.title,
            summary: l.summary,
            points: l.points,
            content: l.content?.slice(0, 5000),
          })),
        },
        avoidQuestions: [
          ...unit.lessons.flatMap((l) => [
            l.quiz?.question,
            ...(l.teaching?.steps || []).map((s) => s.checkpoint?.question),
          ]),
          ...existing
            .filter((p) => p.unitIndex === unitIndex)
            .map((p) => p.prompt),
        ].filter(Boolean),
        request:
          "为当前单元设计独立的课后应用练习，不复用随堂问答。从选择、判断、填空、简答和适用的编程题中组合，结合不同情境设计题目，避免整组都为一种题型。题量按实际目标决定。包含完整参考思路与自评标准。",
      }),
    },
  ];
  signal?.throwIfAborted();
  const { runValidatedGeneration } = await import("./course-agent.js");
  return runValidatedGeneration({
    signal,
    request,
    messages: messages,
    kind: "course_practice",
    repairLabel: "独立练习",
    validate: (result) => validatePractice(result, course, unitIndex, existing),
    exhausted: () =>
      new Error("暂时未能生成可用练习，已有练习和作答已保留。请稍后再试。"),
  });
}

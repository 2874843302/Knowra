// Authored examples accompany the built-in lesson; they are not executed code.
export const attentionTeaching = {
  mode: "script",
  steps: [
    {
      title: "为什么只看一眼消息，也会断掉思路？",
      board:
        "读到一半 → 通知亮起 → 回来重读\n\n这节课看三个问题：\n- **注意力选了什么？**\n- **切换时丢了什么？**\n- 怎样给专注创造条件？",
      narration:
        "先想一个熟悉的场景：你正在读一段难懂的材料，手机亮了一下。你只是看了一眼，没回复。回来以后，却发现刚才读到哪里、这句话为什么重要，都需要重新想。今天我们就从这个小中断出发，看看注意力到底是怎么分配的。",
    },
    {
      title: "把注意力想成一束聚光灯",
      board:
        "**优先处理 ≠ 同样深入地处理一切**\n\n当前目标 → 分配注意\n环境线索 → 也可能把注意拉走",
      narration:
        "聚光灯能帮助我们建立一个直觉：灯照到的地方更容易被看清，但舞台的其他地方并没有消失。阅读是你当前的目标，通知声却是一条新的环境线索。即使你没有回复，它也可能把注意拉走。所以，不回复消息和完全没受干扰，是两回事。",
      annotations: [{ kind: "highlight", snippet: "优先处理" }],
      checkpoint: {
        type: "choice",
        question: "通知响了，但没有回复，就一定没影响阅读吗？",
        options: ["是，只有回复才会打断", "不一定，注意可能已经转移"],
        answer: 1,
        explanation:
          "环境线索可能抢占注意；是否回复不是判断是否受到干扰的唯一条件。",
      },
    },
    {
      title: "回到任务，还要重新找到上下文",
      board: "**切换成本：重建目标、规则与上下文**\n\n感到忙碌 ≠ 持续推进",
      narration:
        "接着看这条路径。第一步，通知把你的注意拉到了消息上；第二步，原来材料的目标暂时离开了中心；第三步，回到阅读时，你得找回刚才的上下文。时间不只花在看消息上，还花在重新接上思路上。这就解释了为什么一天很忙，却感觉重要的事没推进多少。",
      visual: {
        type: "diagram",
        layout: "flow",
        title: "一次中断，三个环节",
        nodes: [
          {
            label: "注意被拉走",
            detail: "通知成为新的线索；没有回复，也可能发生注意转移。",
          },
          {
            label: "切换到新目标",
            detail:
              "你开始判断消息是谁发的、是否要处理，当前任务的目标被暂时搁置。",
          },
          {
            label: "重新接上思路",
            detail:
              "回到阅读后，要重新建立刚才的目标、规则与上下文；这也是成本的一部分。",
          },
        ],
        caption: "这是帮助理解的过程示意，影响程度会随任务与个体而不同。",
      },
    },
    {
      title: "把两种工作方式放在一起",
      board:
        "A：读材料 ↔ 查消息 ↔ 读材料\n\nB：**完成一个阅读目标 → 再处理消息**",
      narration:
        "现在比较两种安排。第一种是一边读材料，一边随时看消息，注意反复进出同一个任务。第二种是先完成一个明确的阅读目标，再集中处理消息。第二种安排的价值，不是承诺人人都会快多少，而是减少反复重建上下文的机会。复杂任务尤其值得这样试一试。",
      checkpoint: {
        type: "choice",
        question: "你要理解一段复杂材料，哪种安排更能减少反复重建上下文？",
        options: ["每来一条消息就看一眼", "先完成一个阅读目标，再集中处理消息"],
        answer: 1,
        explanation:
          "把同类消息集中处理，可以减少阅读与消息之间的反复切换；并不保证所有人都有相同改善幅度。",
      },
    },
    {
      title: "给专注设计一条可执行的路径",
      board:
        "**目标要具体，环境要配合**\n\n“认真学习” → “读完这一节，写下 3 个要点”",
      narration:
        "到这里，别只给自己一句认真一点。我们把目标改小：读完这一节，写下三个要点。开始之前先把非必要通知关掉，旁边放一张纸，临时想到的待办先记下来，完成这个目标以后再处理。这样你不必靠不断提醒自己来维持专注，环境也会帮上一点忙。",
      visual: {
        type: "diagram",
        layout: "flow",
        title: "让环境支持当前目标",
        nodes: [
          {
            label: "一个明确目标",
            detail:
              "例如读完当前小节并写出三个要点；用可检验的产出代替模糊的努力要求。",
          },
          {
            label: "收好干扰线索",
            detail: "关闭非必要通知；想到其他事情时先记下来，而不是立刻切换。",
          },
          {
            label: "完成后再处理",
            detail: "留出处理消息的时间，再回顾自己实际完成了什么。",
          },
        ],
      },
    },
    {
      title: "用一次小实验检验，而不是凭感觉",
      board:
        "保持任务难度接近\n\n记录：**完成量 · 中断次数 · 理解是否正确**\n\n观察记录 → 调整下一次安排",
      narration:
        "最后，把它当作一次自己的小实验。找难度接近的两段材料，一次按平常方式做，一次减少不必要的切换。记录完成量、被打断的次数，再合上资料检验理解。不要只看哪次更忙，也不要从一次结果就下定论。我们要的是用记录持续调整，而不是给自己贴上不专注的标签。",
      annotations: [{ kind: "underline", snippet: "完成量" }],
    },
  ],
};

export const pythonValuesTeaching = {
  checkpointAfter: 1,
  steps: [
    {
      narration:
        "先看 price 和 19.9。左边是名字，右边是这个名字指向的数据。再给一段文字起名叫 name。名字可以很相似，但它们指向的对象有不同的类型。",
      annotations: [
        { kind: "circle", snippet: "price = 19.9" },
        { kind: "highlight", snippet: "浮点数对象" },
      ],
      visual: {
        type: "bindings",
        title: "名字指向数据",
        items: [
          { name: "price", value: "19.9", type: "float · 数字" },
          { name: "name", value: '"Notebook"', type: "str · 文本" },
        ],
      },
    },
    {
      narration:
        "同样是加号，为什么结果不同？先看没有引号的 3 和 2，它们相加得到 5。加上引号后，两边变成了文本，加号把它们接在一起，得到 32。先判断类型，再判断运算。",
      annotations: [
        { kind: "circle", snippet: '"3" + "2"' },
        { kind: "highlight", snippet: "转换" },
      ],
      visual: {
        type: "comparison",
        title: "同一个 +，两种含义",
        items: [
          {
            label: "数字相加",
            expression: "3 + 2",
            result: "5",
            detail: "int → int",
          },
          {
            label: "文本拼接",
            expression: '"3" + "2"',
            result: '"32"',
            detail: "str → str",
          },
        ],
      },
    },
    {
      narration:
        "现在把概念用在购物的小计算里。第一行记录单价。右侧的计算推演会保留每一步已经得到的值。",
      visual: {
        type: "trace",
        title: "计算推演",
        rows: [{ name: "price", value: "19.9" }],
      },
    },
    {
      narration:
        "第二行记录数量 3。此时我们有两个独立的名字：单价 price，以及数量 quantity。接下来把它们组合起来。",
      visual: {
        type: "trace",
        title: "计算推演",
        rows: [
          { name: "price", value: "19.9" },
          { name: "quantity", value: "3" },
        ],
      },
    },
    {
      narration:
        "星号表示乘法。先取出单价和数量，相乘后把结果绑定到 total。十进制算式是 19.9 乘 3 等于 59.7；计算机保存浮点数时可能存在微小误差。",
      annotations: [{ kind: "highlight", snippet: "price * quantity" }],
      visual: {
        type: "trace",
        title: "计算推演",
        rows: [
          { name: "price", value: "19.9" },
          { name: "quantity", value: "3" },
          { name: "total", value: "19.9 × 3 ≈ 59.7" },
        ],
      },
    },
    {
      narration:
        "最后把结果显示出来。冒号后的点 2 f 将结果格式化成两位小数，所以展示的是 59.70。显示格式不会改变底层浮点数的精度。",
      annotations: [{ kind: "circle", snippet: ".2f" }],
      visual: {
        type: "trace",
        title: "计算推演",
        rows: [
          { name: "price", value: "19.9" },
          { name: "quantity", value: "3" },
          { name: "total", value: "≈ 59.7" },
        ],
        output: "总价：59.70",
      },
    },
    {
      narration:
        "记住最后这个边界：显示两位小数不等于精确的货币运算。金额需要严格精确时，可以用 Decimal，或者把最小货币单位存成整数。",
      annotations: [{ kind: "highlight", snippet: "精度限制" }],
    },
  ],
};

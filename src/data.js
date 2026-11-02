import { normalizeQuestion } from "./lib/questions.js";
import { normalizeTeachingVisual } from "./lib/teaching-visuals.js";
import {
  normalizeTeachingDesign,
  normalizeTeachingDirection,
} from "./lib/teaching-direction.js";
import {
  pythonValuesTeaching,
  attentionTeaching,
} from "./lib/lesson-teaching.js";
import { normalizeBoardAnnotations } from "./lib/board-emphasis.js";
import {
  lessonCheckpoints,
  normalizeCheckpoint,
} from "./lib/teaching-checkpoints.js";
import {
  lessonBoardNotes,
  lessonCodeNarration,
  lessonVectorVisuals,
} from "./lib/lesson-board-notes.js";

const lesson = (
  id,
  title,
  summary,
  points,
  content,
  question,
  options,
  answer,
  explanation,
  teaching,
) => ({
  id,
  title,
  summary,
  points,
  content,
  quiz: { question, options, answer, explanation },
  ...(teaching || lessonBoardNotes[id]
    ? {
        teaching: {
          ...teaching,
          source: content,
          steps:
            teaching?.mode === "script"
              ? teaching.steps
              : (lessonBoardNotes[id] || teaching.steps.map(() => null)).map(
                  (board, index) => ({
                    ...(lessonCodeNarration[id]?.[index]
                      ? { narration: lessonCodeNarration[id][index] }
                      : {}),
                    ...teaching?.steps?.[index],
                    ...(lessonVectorVisuals[id]?.[index]
                      ? { visual: lessonVectorVisuals[id][index] }
                      : {}),
                    ...(lessonCheckpoints[id]?.[index]
                      ? { checkpoint: lessonCheckpoints[id][index] }
                      : {}),
                    ...(board ? { board } : {}),
                  }),
                ),
        },
      }
    : {}),
});

const linear = [
  lesson(
    "vectors",
    "向量：从一支箭头开始",
    "用方向和长度理解向量，把抽象的数字放回几何世界。",
    [
      "向量同时表达方向与大小",
      "坐标依赖于选择的基底",
      "向量相加遵循平行四边形法则",
    ],
    "## 把一组数字，看成一次移动\n\n向量 **v = (3, 2)** 可以理解为：从原点出发，向右移动 3 个单位，再向上移动 2 个单位。箭头的起点可以改变，但只要方向与长度不变，它仍表示同一个自由向量。\n\n## 向量相加，是把移动接起来\n\n设 **u = (1, 2)**，**v = (3, 1)**。先沿 u 移动，再沿 v 移动，终点是 **u + v = (4, 3)**。每个坐标分别相加，对应把两个方向的位移叠加。\n\n> 向量既可以表示空间里的位移，也可以表示一个样本的特征。例如 (身高, 体重)，但这时两个坐标的单位不同，计算距离前通常需要标准化。\n\n## 数乘：沿着同一方向缩放\n\n**2v = (6, 4)** 与 v 同方向，长度变为两倍。**−v = (−3, −2)** 长度不变，方向相反。零向量没有确定的方向。\n\n### 动手想一想\n\n如果从当前位置出发，先移动 (2, 1)，再移动 (−2, 3)，最终位移是多少？把两个坐标分别加起来，得到 (0, 4)。",
    "向量 v = (3, 2)，那么 2v 等于？",
    ["(5, 4)", "(6, 4)", "(3, 4)"],
    1,
    "数乘会同时缩放每一个坐标：2 × (3, 2) = (6, 4)。",
  ),
  lesson(
    "basis",
    "基底与线性组合",
    "理解“用两支箭头描述整个平面”的含义。",
    [
      "线性组合是向量的加权相加",
      "基底需要线性无关且张成空间",
      "坐标是相对于基底的系数",
    ],
    "## 用积木拼出向量\n\n给定两个向量 **e₁ = (1, 0)** 和 **e₂ = (0, 1)**，平面上的每一个向量都能写成 **v = x e₁ + y e₂**。这里的 x、y 就是 v 在这组基底中的坐标。\n\n## 为什么不能选两个同方向向量？\n\n假设选择 (1, 0) 和 (2, 0)。无论如何加权，相加的结果都在水平轴上，永远无法得到 (0, 1)。它们线性相关，无法张成整个平面。\n\n## 同一个向量，不同的坐标\n\n把基底改为 b₁ = (1, 1)、b₂ = (1, −1)，向量 (2, 0) 就等于 b₁ + b₂，因此新坐标是 (1, 1)。向量本身没变，描述它的参照系改变了。",
    "下列哪两个向量可以构成二维平面的一组基底？",
    ["(1, 0) 与 (2, 0)", "(0, 0) 与 (1, 1)", "(1, 0) 与 (0, 1)"],
    2,
    "两个向量不共线，既线性无关，又能张成整个二维平面。",
  ),
  lesson(
    "matrices",
    "矩阵，是一种空间变换",
    "从列向量出发，直观理解矩阵如何改变空间。",
    [
      "矩阵的列是基向量变换后的去向",
      "矩阵乘向量对应线性变换",
      "线性变换保留向量加法与数乘",
    ],
    "## 矩阵记录基向量的去向\n\n二维矩阵 A 的第一列告诉我们 e₁ 会去哪里，第二列告诉我们 e₂ 会去哪里。知道了两支基向量的去向，就能知道平面上所有向量的去向。\n\n## 一个具体例子\n\n取 A = [[2, 0], [0, 1]]。它把 e₁ 变成 (2, 0)，把 e₂ 保持在 (0, 1)。于是 v = (1, 2) 变成 Av = (2, 2)：整个平面被横向拉伸到原来的两倍。\n\n## 线性意味着什么？\n\n对于任意向量 u、v 和数 c，线性变换满足 **A(u + v) = Au + Av** 以及 **A(cv) = cAv**。先相加再变换，与先分别变换再相加，得到相同结果。\n\n> 一般的平移不是线性变换，因为线性变换必须把原点留在原点。\n\n### 试试看\n\n调整右侧的横向与纵向缩放系数，观察原始向量和变换后的向量。注意它们如何跟随基向量一起变化。",
    "A = [[2, 0], [0, 3]]，则 A × (1, 2) 等于？",
    ["(2, 6)", "(3, 5)", "(2, 3)"],
    0,
    "第一行与向量点乘得到 2，第二行与向量点乘得到 6。",
  ),
  lesson(
    "composition",
    "矩阵乘法与变换的组合",
    "理解为什么矩阵相乘的顺序如此重要。",
    [
      "AB 表示先做 B 再做 A",
      "矩阵乘法一般不可交换",
      "单位矩阵对应不改变空间的变换",
    ],
    "## 把两个动作接起来\n\n如果 B 是旋转，A 是横向拉伸，那么 ABv 表示先旋转 v，再进行横向拉伸。读矩阵乘法时，从靠近向量的一侧开始。\n\n## 顺序会改变结果\n\n把 (1, 0) 先旋转 90°，再横向放大两倍，结果是 (0, 1)。如果先横向放大，再旋转，结果就是 (0, 2)。因此通常 **AB ≠ BA**。\n\n## 单位矩阵\n\nI = [[1, 0], [0, 1]] 保持每一支基向量不变。所以对于合适维度的矩阵 A，有 AI = IA = A。",
    "表达式 ABv 对向量的操作顺序是？",
    ["先 A，后 B", "先 B，后 A", "同时进行，没有顺序"],
    1,
    "矩阵乘法从右向左作用于列向量。",
  ),
  lesson(
    "determinant",
    "行列式：面积变化的刻度",
    "用面积变化理解行列式与可逆性。",
    [
      "行列式的绝对值是面积缩放倍数",
      "负号表示定向发生翻转",
      "行列式为零意味着空间被压扁",
    ],
    "## 一个小方格变成了什么？\n\n把单位正方形的两个边向量经过 A 变换，得到一个平行四边形。它的有向面积就是 det(A)。对于 [[a, b], [c, d]]，有 **det(A) = ad − bc**。\n\n## 三种重要情况\n\n- det(A) = 2：面积放大到两倍。\n- det(A) = −1：面积大小不变，但定向翻转。\n- det(A) = 0：二维空间被压到一条线或一个点。\n\n## 为什么压扁后无法恢复？\n\n压扁会让多个不同的向量落到同一个位置，信息丢失了。此时不可能找到唯一的逆变换。对于方阵，可逆等价于行列式不为零。",
    "一个二维方阵的行列式为 0，意味着什么？",
    [
      "它一定是单位矩阵",
      "它可以唯一地恢复任意输入",
      "它不可逆，空间发生了降维",
    ],
    2,
    "行列式为零意味着列向量线性相关，空间被压缩到更低维度。",
  ),
  lesson(
    "eigenvectors",
    "特征向量：变换中的不变方向",
    "找到在变换中仍保持原方向所在直线的向量。",
    [
      "特征向量必须是非零向量",
      "Av = λv 表示方向所在直线不变",
      "特征值描述沿该方向的缩放",
    ],
    "## 大多数箭头都会转向\n\n经过线性变换后，普通向量往往既改变长度，也改变方向。但有些非零向量特别稳定：它们变换后依然落在原来所在的直线上。\n\n## 核心方程\n\n**Av = λv**。这里 v 是特征向量，λ 是对应的特征值。λ 为负时方向反转，为 0 时向量被压到原点。\n\n## 从简单矩阵看起\n\n对于 A = [[2, 0], [0, 3]]，水平向量会缩放两倍，竖直向量会缩放三倍。所以 e₁、e₂ 是特征向量，对应特征值分别为 2 和 3。\n\n### 为什么有用？\n\n主成分分析研究协方差矩阵的特征方向，用于发现数据中变化最显著的方向。特征向量因此连接了几何、统计与机器学习。",
    "在 Av = λv 中，特征向量 v 可以是零向量吗？",
    ["不可以", "可以", "仅当 λ = 0 时可以"],
    0,
    "定义要求特征向量非零，否则任意 λ 都满足方程，无法描述一个方向。",
  ),
];

const ai = [
  lesson(
    "ai-pattern",
    "机器如何从示例中学习",
    "从规则到模式，理解机器学习的基本过程。",
    [
      "规则程序由人直接描述逻辑",
      "机器学习从样本中拟合规律",
      "训练和使用模型是不同阶段",
    ],
    "## 从写规则，到学规律\n\n识别垃圾邮件时，可以手写“包含某个词就拦截”的规则。但措辞不断变化，规则很快失效。机器学习采用另一条路线：提供大量带标签邮件，让模型学习哪些特征与垃圾邮件相关。\n\n## 三个基本要素\n\n**数据**提供样本，**模型**定义可调整的函数，**目标函数**衡量预测与真实标签之间的差距。训练通过优化模型参数来减少这个差距。\n\n## 学会训练集，不等于学会任务\n\n如果模型记住了每封训练邮件，却无法判断新的邮件，就发生了过拟合。我们要用模型从未见过的测试集检查它的泛化能力。",
    "用从未参与训练的数据评估模型，主要是在检验什么？",
    ["记忆训练样本的能力", "泛化能力", "训练速度"],
    1,
    "测试集模拟新数据，用于检验模型能否把规律推广到未见样本。",
  ),
  lesson(
    "ai-token",
    "语言如何变成数字",
    "理解 token、向量表示与上下文。",
    [
      "Token 不一定等于一个字或一个词",
      "嵌入把离散符号表示成向量",
      "上下文窗口限制一次处理的内容",
    ],
    "## 先把文本拆成片段\n\n模型处理的基本单位通常是 token。一个汉字、一个英文词，甚至词的一部分，都可能对应一个或多个 token，具体由分词器决定。\n\n## 用向量表示 token\n\nToken 的编号会被映射成向量，模型在这些向量上进行计算。随着层层处理，一个词的表示会结合它的上下文，帮助区分“苹果手机”和“吃苹果”。\n\n## 上下文不是永久记忆\n\n模型只能直接处理当前请求提供的上下文。产品中的长期记忆通常需要额外的数据库、检索或摘要机制。不能把很长的聊天记录等同于可靠的永久记忆。",
    "Token 和英文单词之间的关系是？",
    [
      "始终一一对应",
      "一个单词必须对应十个 Token",
      "一个单词可能被拆成多个 Token",
    ],
    2,
    "分词策略不同，一个词可能对应一个或多个 token。",
  ),
  lesson(
    "ai-attention",
    "注意力：理解上下文的关系",
    "直观理解模型如何关联不同位置的信息。",
    [
      "注意力对信息进行加权汇总",
      "Query、Key、Value 承担不同角色",
      "注意力权重不等于完整因果解释",
    ],
    "## 当前词应该参考哪里？\n\n在“杯子掉到地上，它碎了”中，理解“它”需要关联前面的“杯子”。注意力机制让一个位置根据匹配程度，从其他位置汇集信息。\n\n## 一个检索的类比\n\nQuery 像查询，Key 像可匹配的索引，Value 是要读取的内容。匹配分数经过归一化后，形成对 Value 的加权组合。\n\n## 多头关注不同关系\n\n不同注意力头可以学到不同的信息关系。但单看某个头的权重，通常不足以解释模型为什么给出一个最终答案。",
    "注意力机制的核心操作更接近哪一种？",
    ["按相关程度加权汇总信息", "永久记住全部训练数据", "按字母顺序排列文本"],
    0,
    "注意力基于匹配分数，对相关位置的表示进行加权组合。",
  ),
  lesson(
    "ai-reliable",
    "让 AI 的回答更可靠",
    "把模型输出和可验证的证据联系起来。",
    [
      "流畅表达不保证事实正确",
      "检索增强为回答提供外部依据",
      "重要结论需要核对原始资料",
    ],
    "## 为什么会有看似合理的错误？\n\n语言模型的训练目标与生成机制，不能保证每一句话都对应真实事实。一个不存在的文献标题，也可能被写得非常自然。\n\n## 给模型可信资料\n\n检索增强生成会先查找相关资料，再把结果交给模型组织答案。它能改善信息依据，但检索错误、资料过期或模型误读仍会带来错误。\n\n## 一套可操作的核查流程\n\n把结论拆成可检验的主张，检查引用是否存在，打开原文核对上下文，确认日期和适用范围。对没有依据的部分，保留不确定性。",
    "给回答加上引用链接，就能保证它正确吗？",
    [
      "能，链接就是证据",
      "不能，还需要检查原文是否支持结论",
      "能，只要引用数量足够多",
    ],
    1,
    "链接可能不存在或不支持相关主张，必须检查内容与上下文。",
  ),
];

const python = [
  lesson(
    "py-values",
    "变量与数据：第一行 Python",
    "从变量、类型和表达式开始写程序。",
    ["变量名引用对象", "字符串与数字是不同类型", "表达式求值后产生结果"],
    '## 给数据一个名字\n\n`price = 19.9` 把名称 price 绑定到一个浮点数对象。`name = "Notebook"` 把名称绑定到字符串。变量名让代码表达数据的用途。\n\n## 类型决定能做什么\n\n`3 + 2` 得到数字 5，而 `"3" + "2"` 得到字符串 "32"。从用户输入获得的文本，参与数值计算前通常需要用 int 或 float 转换。\n\n## 写一个小计算\n\n```python\nprice = 19.9\nquantity = 3\ntotal = price * quantity\nprint(f"总价：{total:.2f}")\n```\n\n浮点数存在精度限制。涉及严格货币运算时，使用 Decimal 或以整数表示最小货币单位。',
    'Python 中，"3" + "2" 的结果是？',
    ["5", '"32"', "发生语法错误"],
    1,
    '两个字符串相加执行拼接，得到 "32"。',
    pythonValuesTeaching,
  ),
  lesson(
    "py-list",
    "列表与循环：处理一组数据",
    "让程序对每个元素重复执行操作。",
    ["列表保持元素顺序", "for 遍历可迭代对象", "列表推导式可以简洁地转换数据"],
    "## 从单个数字到一组数字\n\n`prices = [12, 18, 25]` 创建了一个列表。索引从 0 开始，`prices[0]` 是 12。\n\n## 遍历每个元素\n\n```python\nfor price in prices:\n    print(price * 0.9)\n```\n\n冒号引出代码块，缩进表示循环体。每一轮，price 都绑定到列表中的下一个元素。\n\n## 用列表推导式创建新列表\n\n`discounted = [p * 0.9 for p in prices]` 会产生一个新列表。它没有改变原来的 prices。",
    "列表 [12, 18, 25] 的索引 1 对应哪个元素？",
    ["12", "18", "25"],
    1,
    "Python 列表从索引 0 开始计数，索引 1 是第二个元素。",
  ),
  lesson(
    "py-function",
    "函数：把重复逻辑收起来",
    "为一段逻辑定义清晰的输入和输出。",
    ["def 定义函数", "return 返回计算结果", "参数让同一逻辑适用于不同输入"],
    "## 定义一次，多次使用\n\n```python\ndef discounted_price(price, rate):\n    return price * (1 - rate)\n\nresult = discounted_price(100, 0.2)\n```\n\n函数把价格和折扣比例作为输入，返回折后价格。调用处不需要重复内部公式。\n\n## 输出和返回不同\n\nprint 将内容显示出来，return 将值交给调用者。如果函数没有执行带值的 return，返回值是 None。\n\n## 让函数易于理解\n\n使用明确的名称，保持职责集中。需要时检查输入，例如折扣比例应在 0 到 1 之间。",
    "函数没有显式 return 时，默认返回什么？",
    ["0", "空字符串", "None"],
    2,
    "Python 函数没有显式返回值时返回 None。",
  ),
  lesson(
    "py-data",
    "字典与文件：保存你的数据",
    "用结构化数据管理真实任务。",
    ["字典保存键值关系", "with 负责关闭文件资源", "JSON 适合交换结构化数据"],
    '## 用键描述含义\n\n`book = {"title": "Python 入门", "price": 39}` 比仅有位置含义的列表更直观。可以使用 `book["title"]` 获取标题。\n\n## 将数据保存为 JSON\n\n```python\nimport json\n\nwith open("book.json", "w", encoding="utf-8") as file:\n    json.dump(book, file, ensure_ascii=False, indent=2)\n```\n\nwith 在结束时关闭文件，即使中途发生异常。读取数据时可以使用 json.load。\n\n## 处理失败\n\n文件可能不存在，JSON 也可能格式错误。应当分别处理具体异常，并告诉使用者如何修正。',
    "用来保存键值关系的数据结构是？",
    ["字典 dict", "集合 set", "整数 int"],
    0,
    "字典通过键访问对应的值，适合表达带名称的属性。",
  ),
];

const psych = [
  lesson(
    "memory",
    "记忆：为什么看过不等于记住",
    "区分编码、存储与提取。",
    [
      "记忆包含编码、存储、提取",
      "熟悉感不等于可以主动回忆",
      "复习效果需要通过延迟测试检验",
    ],
    "## “看起来熟悉”的错觉\n\n反复阅读时，文字处理变得顺畅，容易被误判为已经掌握。合上资料后能否独立解释，才更接近一次主动提取。\n\n## 记忆的三个环节\n\n编码把经历转成可存储的表示，存储让信息在时间中保持，提取则让我们在需要时访问它。任何一个环节受影响，都可能表现为“想不起来”。\n\n## 一个可以实践的方法\n\n读完一小节后合上资料，写出三个要点，再回到原文纠正。第二天换一种题目进行复测，观察是否能把知识用到新的情境。",
    "反复阅读带来的熟悉感，是否等于已经能独立回忆？",
    ["始终等价", "不一定，需要主动提取检验", "只要读三次就等价"],
    1,
    "识别时的熟悉感和主动提取是不同的表现，需要通过实际回忆检验。",
  ),
  lesson(
    "attention",
    "注意力：有限的认知资源",
    "理解选择性注意和任务切换。",
    ["注意力资源有限", "任务切换通常有额外成本", "环境线索会影响注意分配"],
    "## 我们无法同样深入地处理一切\n\n选择性注意让某些信息获得优先处理。阅读时，通知声会把注意转移到另一个任务，即使没有立即回复，也可能打断当前思路。\n\n## 多任务常常是快速切换\n\n在复杂任务间来回切换，需要重新加载目标、规则和上下文。这种切换成本会影响速度与准确性，具体影响随任务和个体不同。\n\n## 为专注调整环境\n\n在一个短时段只保留一个明确目标，把待处理消息集中到另一个时间，再记录实际完成量。通过行为记录来调整，而不是只根据主观忙碌感判断。",
    "在两个复杂任务之间频繁切换，通常会怎样？",
    ["完全没有成本", "一定提高准确率", "产生额外切换成本"],
    2,
    "重新建立任务目标和上下文会占用认知资源。",
    attentionTeaching,
  ),
];

const courses = [
  {
    id: "linear-algebra",
    title: "线性代数的几何直觉",
    subtitle: "看见矩阵背后的空间",
    category: "数学与统计",
    level: "入门",
    cover: "math",
    color: "#e4eafa",
    description:
      "从一支向量开始，理解基底、矩阵变换、行列式与特征向量。用几何直觉串起公式背后的逻辑。",
    units: [
      { title: "从向量认识空间", lessons: linear.slice(0, 2) },
      { title: "矩阵与线性变换", lessons: linear.slice(2, 4) },
      { title: "理解空间的不变量", lessons: linear.slice(4) },
    ],
    minutes: 120,
  },
  {
    id: "how-ai-works",
    title: "人工智能如何工作",
    subtitle: "打开 AI 的黑盒",
    category: "AI 与数据科学",
    level: "入门",
    cover: "computing",
    color: "#e9efdf",
    description:
      "从数据和模式出发，理解语言模型、注意力机制与可靠性，建立使用 AI 的判断力。",
    units: [
      { title: "从模式到语言", lessons: ai.slice(0, 2) },
      { title: "理解能力与边界", lessons: ai.slice(2) },
    ],
    minutes: 90,
  },
  {
    id: "python",
    title: "Python 编程第一课",
    subtitle: "用代码解决一个小问题",
    category: "计算机科学",
    level: "入门",
    cover: "computing",
    color: "#e7edf3",
    description:
      "亲手处理变量、列表、函数和文件，把零散语法串成可以复用的小程序。",
    units: [
      { title: "让程序运行起来", lessons: python.slice(0, 2) },
      { title: "组织与保存数据", lessons: python.slice(2) },
    ],
    minutes: 100,
  },
  {
    id: "cognitive",
    title: "认知心理学：理解自己",
    subtitle: "从记忆到注意力",
    category: "心理学",
    level: "入门",
    cover: "library",
    color: "#f4e6df",
    description:
      "从日常的学习体验出发，认识记忆与注意力，建立可检验的学习方法。",
    units: [{ title: "认识学习中的大脑", lessons: psych }],
    minutes: 45,
  },
  {
    id: "ai-practice",
    title: "大语言模型应用入门",
    subtitle: "让知识连接实际问题",
    category: "AI 与数据科学",
    level: "进阶",
    cover: "earth",
    color: "#e7ecf3",
    description:
      "把语言表示、注意力和事实核查联系起来，为构建可靠的 AI 应用打下概念基础。",
    units: [
      { title: "模型的语言世界", lessons: ai.slice(1, 3) },
      { title: "可靠性与评估", lessons: ai.slice(3) },
    ],
    minutes: 70,
  },
  {
    id: "study-science",
    title: "学习如何学习",
    subtitle: "让每一次复习更有效",
    category: "学习方法",
    level: "入门",
    cover: "library",
    color: "#efece3",
    description:
      "通过主动回忆和注意力管理，观察自己的学习过程，找到适合自己的复习节奏。",
    units: [{ title: "建立自己的学习方法", lessons: psych }],
    minutes: 40,
  },
];
export const catalog = courses.map((c) => ({
  ...c,
  source: "知序学习室",
  curated: true,
}));
export const lessonsOf = (course) => course.units.flatMap((u) => u.lessons);
export const progressOf = (course, progress) => {
  const lessons = lessonsOf(course);
  return lessons.length
    ? Math.round(
        (lessons.filter((l) => progress[`${course.id}/${l.id}`]?.completed)
          .length /
          lessons.length) *
          100,
      )
    : 0;
};
export const initialState = () => ({
  version: 1,
  name: "学习者",
  joined: ["linear-algebra", "python"],
  customCourses: [],
  courseDrafts: {},
  appearance: { sidebarCollapsed: false, boardFont: "hand" },
  progress: {},
  materials: {},
  notes: {},
  highlights: {},
  lessonChats: {},
  lessonAdaptations: {},
  projects: {},
  coursePractices: {},
  practiceAttempts: {},
  boardPages: {},
  lessonPlayback: {},
  conversations: [],
  activities: [],
  tasks: [],
  dailyGoal: 30,
  lastCourse: "linear-algebra",
  lastLesson: "vectors",
  bookmarks: [],
});
export function validateOutline(value) {
  if (
    !value ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    !Array.isArray(value.units) ||
    !value.units.length
  )
    throw new Error("模型返回的课程结构不完整，请重新生成。");
  return value.units.map((unit, ui) => {
    if (
      typeof unit?.title !== "string" ||
      !unit.title.trim() ||
      !Array.isArray(unit.lessons) ||
      !unit.lessons.length
    )
      throw new Error("课程缺少有效的单元或讲次。");
    return {
      title: unit.title.slice(0, 120),
      lessons: unit.lessons.map((l, li) => {
        if (
          typeof l?.title !== "string" ||
          !l.title.trim() ||
          typeof l.content !== "string" ||
          !l.content.trim()
        )
          throw new Error("课程讲义不完整，请重新生成。");
        const q = l.quiz;
        let teaching;
        if (l.teaching != null) {
          const script = l.teaching.steps;
          if (
            !Array.isArray(script) ||
            !script.length ||
            script.some(
              (step) =>
                !step ||
                ["title", "board", "narration"].some(
                  (field) =>
                    typeof step[field] !== "string" ||
                    !step[field].trim() ||
                    step[field].length > (field === "title" ? 120 : 6000),
                ),
            ) ||
            script.some((step) => step.board.trim() === step.narration.trim())
          )
            throw new Error("板书与讲解脚本不完整，请重新生成。");
          teaching = {
            source: l.content,
            mode: "script",
            ...(l.teaching.design != null
              ? { design: normalizeTeachingDesign(l.teaching.design) }
              : {}),
            steps: script.map(
              ({
                title,
                board,
                narration,
                annotations,
                checkpoint,
                visual,
                role,
                delivery,
              }) => ({
                title: title.trim(),
                board: board.trim(),
                narration: narration.trim(),
                ...normalizeTeachingDirection({
                  narration,
                  visual,
                  role,
                  delivery,
                }),
                annotations: normalizeBoardAnnotations(annotations),
                ...(visual != null
                  ? { visual: normalizeTeachingVisual(visual) }
                  : {}),
                ...(checkpoint != null
                  ? { checkpoint: normalizeCheckpoint(checkpoint) }
                  : {}),
              }),
            ),
          };
        }
        let quiz = null;
        if (q) {
          try {
            quiz = {
              ...q,
              ...normalizeQuestion(q, { allowEmptyExplanation: true }),
            };
          } catch (error) {
            throw new Error(`课程测验格式有误：${error.message}`);
          }
        }
        return {
          ...l,
          teaching,
          id: `lesson-${ui}-${li}`,
          points: Array.isArray(l.points)
            ? l.points.filter((p) => typeof p === "string").slice(0, 6)
            : [],
          summary: typeof l.summary === "string" ? l.summary : "",
          quiz,
        };
      }),
    };
  });
}

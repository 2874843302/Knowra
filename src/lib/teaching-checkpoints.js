import {
  normalizeQuestion,
  questionOptions,
  questionType,
} from "./questions.js";

export function normalizeCheckpoint(value) {
  try {
    const question = normalizeQuestion(value);
    if (value.feedback != null) {
      const options = questionOptions(question);
      if (
        !["choice", "true_false"].includes(questionType(question)) ||
        !Array.isArray(value.feedback) ||
        value.feedback.length !== options.length ||
        options.some(
          (option) =>
            value.feedback.filter((item) => item?.selected === option.value)
              .length !== 1,
        ) ||
        value.feedback.some((item) =>
          ["title", "board", "narration"].some(
            (field) =>
              typeof item[field] !== "string" ||
              !item[field].trim() ||
              item[field].length > (field === "title" ? 120 : 1200),
          ),
        )
      )
        throw new Error(
          "feedback 必须为每个选项提供唯一的 selected、title、board 和 narration。",
        );
      question.feedback = value.feedback.map(
        ({ selected, title, board, narration }) => ({
          selected,
          title: title.trim(),
          board: board.trim(),
          narration: narration.trim(),
        }),
      );
    }
    return question;
  } catch (error) {
    throw new Error(`随堂理解题格式有误：${error.message}`);
  }
}

const check = (question, options, answer, explanation) => ({
  question,
  options,
  answer,
  explanation,
});

// These checks follow the exact authored board segment, rather than placing an
// end-of-lesson exam before its prerequisite concepts have been explained.
export const lessonCheckpoints = {
  vectors: {
    0: check(
      "把一个向量的起点平移，方向和长度不变，它还是同一个自由向量吗？",
      ["是", "不是"],
      0,
      "自由向量由方向和长度确定，不依赖箭头的起点。",
    ),
  },
  basis: {
    0: check(
      "在标准基底中，v = 3e₁ + 2e₂ 的坐标是什么？",
      ["(3, 2)", "(2, 3)", "(5, 5)"],
      0,
      "两个坐标分别是沿 e₁ 和 e₂ 的组合系数。",
    ),
  },
  matrices: {
    0: check(
      "矩阵的第一列表示哪个基向量变换后的去向？",
      ["e₁", "e₂", "任意一个都可以"],
      0,
      "第一列对应 e₁ 的新位置，第二列对应 e₂ 的新位置。",
    ),
  },
  composition: {
    0: check(
      "ABv 应该先对向量应用哪个变换？",
      ["先 A", "先 B"],
      1,
      "从右往左计算：先得到 Bv，再应用 A。",
    ),
  },
  determinant: {
    0: check(
      "矩阵 [[a, b], [c, d]] 的行列式是哪一个？",
      ["ad − bc", "ab − cd", "a + d"],
      0,
      "二维方阵的行列式为 ad − bc，表示有向面积的缩放因子。",
    ),
  },
  eigenvectors: {
    0: check(
      "特征向量经过变换后，一定保持什么？",
      ["仍在原来的直线上", "长度完全不变", "一定不反向"],
      0,
      "特征向量可以被缩放或反向，但仍在原来的直线上。",
    ),
  },
  "ai-pattern": {
    0: check(
      "机器学习与人工编写规则的关键区别是什么？",
      ["从样本中学习规律", "不需要任何数据", "总能给出正确答案"],
      0,
      "机器学习通过样本调整模型，而不是由人穷举每一条判断规则。",
    ),
  },
  "ai-token": {
    0: check(
      "一个汉字是否总是对应一个 Token？",
      ["是，固定一一对应", "不是，取决于分词方式"],
      1,
      "Token 是模型处理的文本片段，汉字、单词和 Token 并非固定的一一对应关系。",
    ),
  },
  "ai-attention": {
    0: check(
      "“杯子掉地上，它碎了”中的注意力关联主要帮助理解什么？",
      ["“它”指向杯子", "句子一定符合事实", "杯子的实际价格"],
      0,
      "这里的例子说明注意力如何关联上下文中的指代关系，不能保证事实正确。",
    ),
  },
  "ai-reliable": {
    0: check(
      "一段 AI 回答读起来非常流畅，是否足以证明事实正确？",
      ["足以证明", "还需要核查证据"],
      1,
      "表达流畅与事实真实是两个维度，具体主张和引用仍需验证。",
    ),
  },
  "py-list": {
    0: check(
      "prices = [12, 18, 25]，prices[0] 是多少？",
      ["12", "18", "25"],
      0,
      "列表索引从 0 开始，因此索引 0 对应第一个元素 12。",
    ),
  },
  memory: {
    0: check(
      "读完一段内容觉得很熟悉，就说明掌握了吗？",
      ["是", "需要通过主动回忆验证"],
      1,
      "阅读熟悉感不等于掌握；合上材料尝试回忆，才能暴露理解缺口。",
    ),
  },
};

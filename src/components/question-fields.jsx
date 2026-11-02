import React, { useId } from "react";
import { Check } from "lucide-react";
import { Button, Input, Textarea } from "../design/primitives";
import { questionType, questionOptions } from "../lib/questions";

export function QuestionFields({
  question,
  value,
  onChange,
  disabled = false,
  submitted = false,
  mode = "exercise",
  onCommit,
}) {
  const id = useId();
  const type = questionType(question);
  if (["choice", "true_false"].includes(type))
    return (
      <div
        className={
          mode === "stage"
            ? "lesson-stage-options"
            : mode === "quiz"
              ? "quiz-options"
              : "exercise-options"
        }
        role="group"
        aria-label="选择你的答案"
      >
        {questionOptions(question).map((o, i) => (
          <Button
            key={i}
            variant={mode === "quiz" ? "surface" : "outline"}
            size={mode === "quiz" ? "surface" : "md"}
            disabled={disabled}
            aria-pressed={value === o.value}
            className={
              mode === "stage"
                ? `lesson-stage-option ${value === o.value ? "is-selected" : ""} ${submitted && o.value === question.answer ? "is-correct" : ""} ${submitted && value === o.value && o.value !== question.answer ? "is-incorrect" : ""}`
                : mode === "quiz"
                  ? `${value === o.value ? "selected" : ""} ${submitted && o.value === question.answer ? "correct" : ""} ${submitted && value === o.value && o.value !== question.answer ? "incorrect" : ""}`
                  : value === o.value
                    ? "is-selected"
                    : ""
            }
            onClick={() => onChange(o.value)}
          >
            <span className={mode === "stage" ? "lesson-option-letter" : ""}>
              {type === "true_false"
                ? o.value
                  ? "✓"
                  : "×"
                : String.fromCharCode(65 + i)}
            </span>
            <strong>{o.label}</strong>
            {submitted && o.value === question.answer && <Check size={14} />}
          </Button>
        ))}
      </div>
    );
  if (type === "fill")
    return (
      <div className={`question-fill-fields question-fields-${mode}`}>
        {question.blanks.map((blank, i) => (
          <label htmlFor={`${id}-${i}`} key={i}>
            <span>{blank.label || `第 ${i + 1} 空`}</span>
            <Input
              id={`${id}-${i}`}
              value={value?.[i] || ""}
              disabled={disabled}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  onCommit?.();
                }
              }}
              onChange={(e) => {
                const answers = Array.from(
                  { length: question.blanks.length },
                  (_, index) => value?.[index] || "",
                );
                answers[i] = e.target.value;
                onChange(answers);
              }}
            />
          </label>
        ))}
      </div>
    );
  return (
    <div className={`exercise-answer question-fields-${mode}`}>
      <label htmlFor={id}>
        你的{type === "code" ? "代码与验证思路" : "解答"}
      </label>
      <Textarea
        id={id}
        className={type === "code" ? "exercise-code" : ""}
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          type === "code"
            ? "在这里编写代码，并记录你如何验证结果…"
            : "用自己的话写下推理、理由或例子…"
        }
      />
    </div>
  );
}

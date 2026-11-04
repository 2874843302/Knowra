import React from "react";
import { Input } from "../design/primitives";

const fields = [
  ["textbook", "教材／课程大纲", "例如：同济《高等数学》第八版上册"],
  ["chapter", "当前章节", "例如：第二章，导数与微分"],
  ["schedule", "课程进度", "例如：下周讲链式法则，每周两次课"],
  ["assessment", "考核要求", "例如：期中考试覆盖前两章，重点练计算题"],
];

export function SchoolLearningFields({
  value = {},
  onChange,
  disabled = false,
}) {
  return (
    <fieldset className="school-learning-fields" disabled={disabled}>
      <legend>跟上你的学校课程</legend>
      <p>填写教材或章节，也可以上传大纲／课件；进度和考核要求可选。</p>
      <div>
        {fields.map(([key, label, placeholder]) => (
          <label key={key}>
            <span>{label}</span>
            <Input
              value={value[key] || ""}
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.value })
              }
              placeholder={placeholder}
              maxLength={1000}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

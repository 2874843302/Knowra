import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { IconButton } from "../ui";

export function AssistantCourseContext({
  course,
  context,
  disabled,
  onChange,
}) {
  if (!context) return null;
  return (
    <div className="assistant-course-context">
      <BookOpen size={19} aria-hidden="true" />
      <div className="assistant-course-context-body">
        {course ? (
          <Link to={`/course/${course.id}`}>{course.title}</Link>
        ) : (
          <strong>关联课程已不可用</strong>
        )}
        {course ? (
          <Select
            value={context.lessonId || "all"}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ ...context, lessonId: value === "all" ? null : value })
            }
          >
            <SelectTrigger aria-label="协助范围">
              <SelectValue placeholder="原讲次已移除，请重新选择" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">整门课程</SelectItem>
              {course.units.map((unit, index) => (
                <SelectGroup key={unit.id || index}>
                  <SelectLabel>
                    单元 {index + 1} · {unit.title}
                  </SelectLabel>
                  {unit.lessons.map((lesson, i) => (
                    <SelectItem key={lesson.id} value={lesson.id}>
                      第 {index + 1} 单元 · 第 {i + 1} 讲：{lesson.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <small>请移除关联后继续提问。</small>
        )}
      </div>
      <IconButton
        icon={X}
        label="移除课程上下文"
        disabled={disabled}
        onClick={() => onChange(null)}
      />
    </div>
  );
}

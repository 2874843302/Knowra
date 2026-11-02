import React from "react";
import { Bookmark } from "lucide-react";
import { Button, IconButton } from "../design/primitives";
import { useStore } from "../store";

export function CourseBookmarkButton({
  course,
  compact = true,
  className = "",
}) {
  const { state, toggleBookmark } = useStore();
  const saved = state.bookmarks.includes(course.id);
  const props = {
    icon: Bookmark,
    className: `course-bookmark ${saved ? "saved" : ""} ${className}`,
    "aria-pressed": saved,
    onClick: () => toggleBookmark(course.id),
  };
  const label = saved ? "取消收藏" : "收藏课程";
  return compact ? (
    <IconButton {...props} label={label} />
  ) : (
    <Button {...props} variant="ghost" size="sm" aria-label={label}>
      {saved ? "已收藏" : "收藏课程"}
    </Button>
  );
}

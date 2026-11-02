import React, { useEffect, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import {
  BookOpen,
  Check,
  CheckCheck,
  Layers3,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { IdentityLineField } from "./identity-line-field";
import { KNOWRA_MARK_PATH } from "../lib/identity-line-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const entranceVariants = {
  hidden: { opacity: 0, y: 26, scale: 0.95 },
  enter: (order) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.42,
      delay: 0.06 + order * 0.18,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
  ready: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.12 } },
};

// Reveal the learning journey once; further motion responds to the user.
export function AuthShowcase() {
  const reduced = useReducedMotion();
  const [motionEnabled, setMotionEnabled] = useState(!reduced);
  const [sourceOpen, setSourceOpen] = useState(false);
  useEffect(() => {
    if (reduced) setMotionEnabled(false);
  }, [reduced]);
  const entrance = useAnimationControls();
  const [introComplete, setIntroComplete] = useState(!!reduced);
  useEffect(() => {
    if (reduced) entrance.set("ready");
    else entrance.start("enter");
    return () => entrance.stop();
  }, [entrance, reduced]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const expanded = !dismissed && (hovered || focused || pinned);
  const transition = reduced
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] };
  const card = (open, closed) => ({
    initial: false,
    animate: expanded ? open : closed,
    transition,
  });
  const reveal = (order, zIndex) => ({
    className: "auth-preview-layer",
    custom: order,
    variants: entranceVariants,
    initial: reduced ? false : "hidden",
    animate: entrance,
    style: { zIndex },
    onAnimationComplete: order === 2 ? () => setIntroComplete(true) : undefined,
  });
  const finishIntro = () => {
    if (introComplete) return;
    entrance.stop();
    if (reduced) entrance.set("ready");
    else entrance.start("ready");
    setIntroComplete(true);
  };
  return (
    <aside
      className="auth-showcase auth-stack-preview"
      aria-label="课程体验预览"
      data-intro={introComplete || reduced ? "complete" : "playing"}
    >
      <div className="auth-stack-heading">
        <span>
          <Sparkles size={15} /> 从一个好问题开始
        </span>
        <h2>把好奇，变成理解。</h2>
        <p>一门为你规划的课，一块陪你思考的白板。</p>
        <button
          type="button"
          className="identity-motion-toggle"
          aria-label="线条动效"
          aria-pressed={motionEnabled}
          onClick={() => setMotionEnabled((value) => !value)}
        >
          {motionEnabled ? <Pause size={12} /> : <Play size={12} />}
          <span className="sr-only">
            {motionEnabled ? "暂停动效" : "开启动效"}
          </span>
        </button>
      </div>
      <div
        className="auth-card-stack"
        role="button"
        tabIndex={0}
        aria-label="展开课程体验卡片"
        aria-expanded={expanded}
        data-expanded={expanded}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") {
            finishIntro();
            setHovered(true);
            setDismissed(false);
          }
        }}
        onPointerLeave={() => {
          setHovered(false);
          setDismissed(false);
        }}
        onFocus={() => {
          finishIntro();
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
          setDismissed(false);
        }}
        onClick={() => {
          finishIntro();
          if (expanded) {
            setPinned(false);
            setDismissed(true);
          } else {
            setPinned(true);
            setDismissed(false);
          }
        }}
        onKeyDown={(event) => {
          if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            event.currentTarget.click();
          } else if (event.key === "Escape") {
            setPinned(false);
            setDismissed(true);
          }
        }}
      >
        <motion.div {...reveal(0, 2)}>
          <motion.article
            className="auth-preview-card auth-preview-course"
            {...card(
              { x: -28, y: 0, rotate: -4, scale: 1 },
              { x: -18, y: 86, rotate: -9, scale: 0.96 },
            )}
          >
            <div className="auth-preview-label">
              <BookOpen size={15} /> 为你规划 <span>01</span>
            </div>
            <h3>用 Python 处理一份清单</h3>
            <div className="auth-preview-units">
              <span>
                <i>1</i> 把数据放在一起 <Check size={13} />
              </span>
              <span>
                <i>2</i> 让重复的事情更简单
              </span>
              <span>
                <i>3</i> 换个场景，自己试一试
              </span>
            </div>
          </motion.article>
        </motion.div>
        <motion.div {...reveal(1, 3)}>
          <motion.article
            className="auth-preview-card auth-preview-board"
            {...card(
              { x: 29, y: 174, rotate: 3, scale: 1 },
              { x: 8, y: 117, rotate: 3, scale: 1 },
            )}
          >
            <div className="auth-preview-label identity-line-label">
              <strong>
                知序 <span>Knowra</span>
              </strong>
              <span>逐行，理解。</span>
            </div>
            <IdentityLineField
              enabled={motionEnabled && introComplete}
              suspended={sourceOpen}
            />
            <h3>让好奇，慢慢有迹可循。</h3>
            <p className="identity-line-caption">
              每一条线，连起一点新的理解。
            </p>
          </motion.article>
        </motion.div>
        <motion.div {...reveal(2, 1)}>
          <motion.article
            className="auth-preview-card auth-preview-success"
            {...card(
              { x: -17, y: 440, rotate: -2, scale: 1 },
              { x: 22, y: 61, rotate: 8, scale: 0.94 },
            )}
          >
            <span className="auth-preview-check">
              <CheckCheck size={22} />
            </span>
            <div>
              <h3>懂了，也能自己做了。</h3>
              <p>每一次理解，都成为你的进步。</p>
            </div>
          </motion.article>
        </motion.div>
      </div>
      <p className="auth-stack-hint">
        <Layers3 size={14} />{" "}
        {expanded
          ? "从规划到学会，每一步都有陪伴"
          : "悬停展开，看看学习如何发生"}
        <button
          type="button"
          className="identity-source-button"
          onClick={() => setSourceOpen(true)}
        >
          查看线条 <span aria-hidden="true">↗</span>
        </button>
      </p>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="identity-source-dialog">
          <DialogHeader>
            <DialogTitle>一条路径，逐行成为知序。</DialogTitle>
            <DialogDescription>
              书本标志被转为亮度网格，再用四种粗细的竖线重构。蓝框标记当前线场中较亮的区域。
            </DialogDescription>
          </DialogHeader>
          <pre>
            <code>{KNOWRA_MARK_PATH}</code>
          </pre>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

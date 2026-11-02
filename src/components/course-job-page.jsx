import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { accountRequest } from "../auth";
import { Button, ButtonLink, Empty, PageHeader, Progress } from "../ui";

export function CourseJobPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true,
      timer;
    const task = new AbortController();
    const load = async () => {
      try {
        const data = await accountRequest(`/course-jobs/${jobId}`, {
          signal: task.signal,
        });
        if (!alive) return;
        setJob(data);
        setError("");
        if (["running", "queued"].includes(data.status))
          timer = setTimeout(load, 2500);
      } catch (e) {
        if (alive && !task.signal.aborted) setError(e.message);
      }
    };
    load();
    return () => {
      alive = false;
      task.abort();
      clearTimeout(timer);
    };
  }, [jobId, refresh]);
  const control = async (action) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await accountRequest(`/course-jobs/${jobId}/${action}`, {
        method: "POST",
      });
      setJob(data);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!job)
    return (
      <main className="page course-job-page">
        <Empty
          icon={error ? BookOpen : LoaderCircle}
          title={error || "正在查看课程进度…"}
          action={
            error && (
              <Button onClick={() => setRefresh((n) => n + 1)}>重新加载</Button>
            )
          }
        />
      </main>
    );
  const active = ["running", "queued"].includes(job.status),
    ready = job.status === "completed";
  return (
    <main className="page course-job-page">
      <PageHeader
        title="来自 Agent 的学习邀请"
        description="工作中的一个问题，也可以成为一门好课。"
      />
      <section className="course-job-card">
        <span className={`course-job-emblem ${active ? "is-working" : ""}`}>
          {ready ? <Check size={29} /> : <BookOpen size={29} />}
        </span>
        <span className="course-job-status" role="status">
          {
            {
              queued: "正在等待生成",
              running: "正在打磨课程",
              completed: "课程已就绪",
              failed: "课程暂未完成",
              interrupted: "生成已中断",
              cancelled: "生成已停止",
            }[job.status]
          }
        </span>
        <h1>{job.title}</h1>
        <p>
          {ready
            ? "课程已经保存到你的学习空间，现在可以开始探索。"
            : active
              ? "教材、白板讲解和练习会逐讲生成。可以离开此页，稍后回来继续查看。"
              : "已经完成的讲次仍然保留，继续时会接着生成。"}
        </p>
        <div className="course-job-progress">
          <span>
            {job.totalLectures
              ? `已完成 ${job.completedLectures} / ${job.totalLectures} 讲`
              : "正在规划适合你的课程蓝图"}
          </span>
          {job.totalLectures && (
            <Progress
              value={(job.completedLectures / job.totalLectures) * 100}
            />
          )}
        </div>
        {job.error && (
          <p className="inline-error" role="alert">
            {job.error}
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="course-job-actions">
          {ready ? (
            <>
              <ButtonLink
                variant="primary"
                icon={Play}
                to={new URL(job.learningUrl).pathname}
                reloadDocument
              >
                开始学习
              </ButtonLink>
              <ButtonLink
                iconRight={ArrowRight}
                to={new URL(job.courseUrl).pathname}
                reloadDocument
              >
                查看课程
              </ButtonLink>
            </>
          ) : active ? (
            <Button
              icon={Square}
              loading={busy}
              onClick={() => control("cancel")}
            >
              停止生成
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={RotateCcw}
              loading={busy}
              onClick={() => control("resume")}
            >
              继续生成课程
            </Button>
          )}
          <ButtonLink to="/settings#mcp">管理 Agent 连接</ButtonLink>
        </div>
      </section>
    </main>
  );
}

import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  Sprout,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { AuthShowcase } from "./auth-showcase";
import { motionTransitions } from "../lib/motion";
import { useAuth, safeReturnTo } from "../auth";
import { Button, Field, Input, PasswordInput } from "../design/primitives";

function AuthFieldPanel({ children }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  const [animating, setAnimating] = useState(false);
  return (
    <motion.div
      className="account-reveal"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={
        reduced ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
      }
      inert={!present ? true : undefined}
      style={{ overflow: present && !animating ? "visible" : "hidden" }}
      onAnimationStart={() => setAnimating(true)}
      onAnimationComplete={() => setAnimating(false)}
    >
      <fieldset disabled={!present}>{children}</fieldset>
    </motion.div>
  );
}
function AuthFieldReveal({ visible, children }) {
  return (
    <AnimatePresence initial={false}>
      {visible && <AuthFieldPanel>{children}</AuthFieldPanel>}
    </AnimatePresence>
  );
}

export function AuthPage({ signup = false }) {
  const { authenticate } = useAuth();
  const reduced = useReducedMotion();
  const [params] = useSearchParams();
  const next = safeReturnTo(params.get("returnTo"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [importLocal, setImportLocal] = useState(false);
  const [legacy] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("knowra-workspace-v1"));
      return saved?.version === 1 ? saved : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    setError("");
    setFieldErrors({});
    setPassword("");
    setConfirm("");
    setRecovering(false);
  }, [signup]);
  const values = { name, email, password, confirm };
  const validateField = (field, data = values) => {
    if (field === "name") return data.name.trim() ? "" : "请输入你的名字。";
    if (field === "email") {
      if (!data.email.trim()) return "请输入邮箱地址。";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())
        ? ""
        : "请输入完整的邮箱地址，例如 you@example.com。";
    }
    if (field === "password") {
      if (!data.password) return "请输入密码。";
      return Array.from(data.password).length >= 8
        ? ""
        : "密码至少需要 8 个字符。";
    }
    if (!data.confirm) return "请再次输入密码。";
    return data.confirm === data.password ? "" : "两次输入的密码不一致。";
  };
  const changeField = (field, setter, value) => {
    setter(value);
    setError("");
    const next = { ...values, [field]: value };
    setFieldErrors((current) => {
      const checkConfirm = signup && field === "password" && confirm;
      if (!current[field] && !checkConfirm) return current;
      return {
        ...current,
        [field]: current[field] ? validateField(field, next) : "",
        ...(checkConfirm ? { confirm: validateField("confirm", next) } : {}),
      };
    });
  };
  const validationProps = (field) => ({
    "aria-invalid": !!fieldErrors[field] || undefined,
    "aria-describedby": fieldErrors[field] ? `auth-${field}-error` : undefined,
    onBlur: (event) => {
      // Let action clicks finish before inserting errors that move the button.
      if (event.relatedTarget?.closest?.("button, a")) return;
      setFieldErrors((current) => ({
        ...current,
        [field]: validateField(field),
      }));
    },
  });
  const fieldError = (field) =>
    fieldErrors[field] ? (
      <span id={`auth-${field}-error`}>
        <CircleAlert size={13} aria-hidden="true" />
        {fieldErrors[field]}
      </span>
    ) : undefined;
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const fields = signup
      ? ["name", "email", "password", "confirm"]
      : ["email", "password"];
    const errors = Object.fromEntries(
      fields.map((field) => [field, validateField(field)]),
    );
    setFieldErrors(errors);
    const invalid = fields.find((field) => errors[field]);
    if (invalid) {
      event.currentTarget.querySelector(`#auth-${invalid}`)?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      await authenticate(signup, {
        email: email.trim(),
        password,
        ...(signup
          ? {
              name: name.trim(),
              ...(importLocal && legacy ? { import_state: legacy } : {}),
            }
          : {}),
      });
      localStorage.setItem("knowra-account-changed", String(Date.now()));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (recovering)
    return <RecoveryPage next={next} onBack={() => setRecovering(false)} />;
  return (
    <main className="auth-page account-page">
      <Link className="auth-brand" to="/">
        <BookOpen size={26} />
        <strong>
          知序 <span>Knowra</span>
        </strong>
      </Link>
      <div className="auth-content">
        <div className="auth-form">
          <nav className="account-mode-switch" aria-label="登录或注册">
            {[false, true].map((register) => (
              <Link
                key={String(register)}
                to={`${register ? "/signup" : "/login"}?returnTo=${encodeURIComponent(next)}`}
                aria-current={register === signup ? "page" : undefined}
                aria-disabled={busy || undefined}
                onClick={(event) => {
                  if (busy) event.preventDefault();
                }}
              >
                {register === signup && (
                  <motion.span
                    className="account-mode-indicator"
                    layoutId="account-auth-mode"
                    transition={
                      reduced ? { duration: 0 } : motionTransitions.springSnappy
                    }
                  />
                )}
                <span>{register ? "注册" : "登录"}</span>
              </Link>
            ))}
          </nav>
          <Sprout size={35} strokeWidth={1.2} />
          <div className="account-form-copy">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={signup ? "signup" : "login"}
                initial={
                  reduced ? false : { opacity: 0, y: 7, filter: "blur(3px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: reduced ? 0 : -6 }}
                transition={reduced ? { duration: 0 } : { duration: 0.16 }}
              >
                <h1>{signup ? "让好奇，有处安放" : "欢迎回来，继续探索"}</h1>
                <p>
                  {signup
                    ? "创建账号，收藏你的知识与每一次进步。"
                    : "登录后，回到属于你的学习空间。"}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
          <form onSubmit={submit} noValidate>
            <AuthFieldReveal visible={signup}>
              <Field
                label="怎么称呼你？"
                htmlFor="auth-name"
                required
                error={fieldError("name")}
              >
                <Input
                  id="auth-name"
                  value={name}
                  onChange={(e) => changeField("name", setName, e.target.value)}
                  {...validationProps("name")}
                  required
                  maxLength={24}
                  autoComplete="nickname"
                  disabled={busy}
                  placeholder="你的名字"
                />
              </Field>
            </AuthFieldReveal>
            <Field
              label="邮箱"
              htmlFor="auth-email"
              required
              error={fieldError("email")}
            >
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => changeField("email", setEmail, e.target.value)}
                {...validationProps("email")}
                required
                maxLength={254}
                disabled={busy}
                placeholder="you@example.com"
              />
            </Field>
            <Field
              label="密码"
              htmlFor="auth-password"
              required
              error={fieldError("password")}
            >
              <div className="account-password">
                <Input
                  id="auth-password"
                  type={show ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) =>
                    changeField("password", setPassword, e.target.value)
                  }
                  {...validationProps("password")}
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={busy}
                  placeholder="至少 8 位字符"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-label={show ? "隐藏密码" : "显示密码"}
                  aria-pressed={show}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </Field>
            {!signup && (
              <button
                type="button"
                className="account-forgot"
                onClick={() => setRecovering(true)}
                disabled={busy}
              >
                忘记密码？
              </button>
            )}
            <AuthFieldReveal visible={signup}>
              <Field
                label="确认密码"
                htmlFor="auth-confirm"
                required
                error={fieldError("confirm")}
              >
                <Input
                  id="auth-confirm"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) =>
                    changeField("confirm", setConfirm, e.target.value)
                  }
                  {...validationProps("confirm")}
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={busy}
                  placeholder="再次输入密码"
                />
              </Field>
            </AuthFieldReveal>
            <AuthFieldReveal visible={signup && !!legacy}>
              <label className="account-import">
                <input
                  type="checkbox"
                  checked={importLocal}
                  onChange={(e) => setImportLocal(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  导入此浏览器原有课程、笔记和资料文字
                  <small>原文件保留在旧空间，不会转移；旧数据也会保留。</small>
                </span>
              </label>
            </AuthFieldReveal>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              iconRight={ArrowRight}
              loading={busy}
              block
            >
              {busy ? "正在打开学习空间…" : signup ? "创建账号" : "登录"}
            </Button>
          </form>
          <p className="account-switch">
            {signup ? "已经有账号？" : "还没有账号？"}
            <Link
              to={`${signup ? "/login" : "/signup"}?returnTo=${encodeURIComponent(next)}`}
              aria-disabled={busy || undefined}
              onClick={(event) => {
                if (busy) event.preventDefault();
              }}
            >
              {signup ? "去登录" : "免费注册"}
            </Link>
          </p>
        </div>
        <AuthShowcase />
      </div>
    </main>
  );
}

function RecoveryPage({ next, onBack }) {
  const { recover } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCode, setNewCode] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError("请输入完整的邮箱地址。");
    if (!code.trim()) return setError("请输入注册时保存的恢复码。");
    if (Array.from(password).length < 8)
      return setError("新密码至少需要 8 个字符。");
    if (password !== confirm) return setError("两次输入的密码不一致。");
    setBusy(true);
    setError("");
    try {
      const value = await recover({
        email: email.trim(),
        code: code.trim(),
        password,
      });
      setNewCode(value.recoveryCode);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page account-page">
      <Link className="auth-brand" to="/">
        <BookOpen size={26} />
        <strong>
          知序 <span>Knowra</span>
        </strong>
      </Link>
      <div className="auth-content">
        <div className="auth-form">
          <nav className="account-mode-switch" aria-label="登录或注册">
            <Link
              to={`/login?returnTo=${encodeURIComponent(next)}`}
              onClick={onBack}
            >
              登录
            </Link>
            <Link to={`/signup?returnTo=${encodeURIComponent(next)}`}>注册</Link>
          </nav>
          <Sprout size={35} strokeWidth={1.2} />
          <div className="account-form-copy">
            <h1>{newCode ? "恢复码已更新" : "用恢复码找回账号"}</h1>
            <p>
              {newCode
                ? "旧密码已失效，全部登录会话已退出。请保存新的恢复码。"
                : "恢复码只在注册时显示一次；输入它并设置新密码。"}
            </p>
          </div>
          {newCode ? (
            <>
              <div className="recovery-code-value">{newCode}</div>
              <Button
                icon={Copy}
                onClick={() => navigator.clipboard.writeText(newCode)}
              >
                复制新恢复码
              </Button>
              <Link
                className="account-back-login"
                to={`/login?returnTo=${encodeURIComponent(next)}`}
              >
                返回登录 <ArrowRight size={14} />
              </Link>
            </>
          ) : (
            <form onSubmit={submit} noValidate>
              <Field label="邮箱" htmlFor="recover-email" required>
                <Input
                  id="recover-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="恢复码" htmlFor="recover-code" required>
                <Input
                  id="recover-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={busy}
                  placeholder="KNRA-XXXX-XXXX-XXXX"
                />
              </Field>
              <Field label="新密码" htmlFor="recover-password" required>
                <PasswordInput
                  id="recover-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                  placeholder="至少 8 位字符"
                />
              </Field>
              <Field label="确认新密码" htmlFor="recover-confirm" required>
                <PasswordInput
                  id="recover-confirm"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  disabled={busy}
                  placeholder="再次输入新密码"
                />
              </Field>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                iconRight={ArrowRight}
                loading={busy}
                block
              >
                {busy ? "正在重置密码…" : "重置密码"}
              </Button>
              <button
                type="button"
                className="account-forgot"
                onClick={onBack}
                disabled={busy}
              >
                返回登录
              </button>
            </form>
          )}
        </div>
        <AuthShowcase />
      </div>
    </main>
  );
}

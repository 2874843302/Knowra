import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./design/primitives";
import { AuthPage } from "./components/auth-page";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export async function accountRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
  });
  const data = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 &&
      !["/auth/login", "/auth/register"].includes(path)
    )
      window.dispatchEvent(new Event("knowra-auth-required"));
    throw new Error(data.error || "请求失败，请稍后再试。");
  }
  return data;
}
export function safeReturnTo(value) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/^\/(login|signup)(\?|$)/.test(value) &&
    !value.includes("\\")
    ? value
    : "/";
}
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const generation = useRef(0);
  const refresh = async () => {
    const current = ++generation.current;
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
      });
      if (current !== generation.current) return;
      if (response.status === 401) {
        setUser(null);
        setError("");
        return;
      }
      if (!response.ok) throw new Error("暂时无法连接账号服务，请重试。");
      const value = await response.json();
      if (current !== generation.current) return;
      setUser(value.user);
      setError("");
    } catch (e) {
      if (current === generation.current) setError(e.message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    const visible = () => {
      if (!document.hidden) refresh();
    };
    const expired = () => {
      generation.current++;
      setUser(null);
    };
    const timer = setInterval(visible, 60000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("knowra-auth-required", expired);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("knowra-auth-required", expired);
    };
  }, []);
  const authenticate = async (signup, payload) => {
    const value = await accountRequest(
      `/auth/${signup ? "register" : "login"}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    generation.current++;
    setError("");
    setUser(value.user);
    return value.user;
  };
  const logout = async () => {
    await accountRequest("/auth/logout", { method: "POST" });
    generation.current++;
    setUser(null);
    localStorage.setItem("knowra-account-changed", String(Date.now()));
  };
  useEffect(() => {
    const changed = (event) => {
      if (event.key === "knowra-account-changed") refresh();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const isAuthRoute = ["/login", "/signup"].includes(location.pathname);
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get("returnTo"),
  );
  useLayoutEffect(() => {
    if (!loading && user && isAuthRoute) navigate(returnTo, { replace: true });
  }, [loading, user, isAuthRoute, returnTo, navigate]);
  return (
    <AuthContext.Provider value={{ user, authenticate, logout, refresh }}>
      {loading ? (
        <div className="workspace-loading">
          <h2>知序 Knowra</h2>
          <p>正在打开学习空间…</p>
        </div>
      ) : user ? (
        <React.Fragment key={user.id}>{children}</React.Fragment>
      ) : error ? (
        <div className="workspace-loading">
          <p role="alert">{error}</p>
          <Button onClick={refresh}>重新连接</Button>
        </div>
      ) : isAuthRoute ? (
        <AuthPage signup={location.pathname === "/signup"} />
      ) : (
        <Navigate
          replace
          to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        />
      )}
    </AuthContext.Provider>
  );
}

import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast as sonnerToast } from "sonner";
import { catalog, initialState } from "./data";
import {
  BASE_KEY,
  changes,
  mergeState,
  workspaceRequest as requestWorkspace,
} from "./persistence";
import { useAuth } from "./auth";
import { WorkspaceLoading } from "./components/workspace-loading";
import { applyTheme } from "./lib/appearance-themes";

const Store = createContext(null);
export const STORAGE_KEY = "knowra-workspace-v1";
export function StoreProvider({ children }) {
  const { user } = useAuth();
  const accountStorageKey = `${STORAGE_KEY}:${user.id}`;
  const accountBaseKey = `${BASE_KEY}:${user.id}`;
  const workspaceRequest = (method, payload) =>
    requestWorkspace(method, payload, user.id);
  const [state, setState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(accountStorageKey));
      if (
        saved?.version === 1 &&
        Array.isArray(saved.joined) &&
        Array.isArray(saved.customCourses)
      )
        return { ...initialState(), ...saved };
    } catch {}
    return { ...initialState(), name: user.name };
  });
  const [storageError, setStorageError] = useState(false);
  useLayoutEffect(() => { applyTheme(state.appearance?.theme); }, [state.appearance?.theme]);
  const [sync, setSync] = useState({ status: "loading" });
  const [ready, setReady] = useState(false);
  const [libraryCatalog, setLibraryCatalog] = useState([]);
  const [libraryCourses, setLibraryCourses] = useState([]);
  const [libraryMine, setLibraryMine] = useState([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const server = useRef(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const flushRef = useRef(null);
  const saveBase = (value) => {
    server.current = value;
    try {
      localStorage.setItem(accountBaseKey, JSON.stringify(value.state));
    } catch {}
  };
  const libraryRequest = async (path, options = {}) => {
    const response = await fetch(`/api/library${path}`, {
      credentials: "same-origin",
      ...options,
    });
    if (response.status === 401) {
      window.dispatchEvent(new Event("knowra-auth-required"));
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "课程库暂时不可用。");
    return data;
  };
  const loadLibrary = async () => {
    try {
      const [catalogData, joinedData, mineData] = await Promise.all([
        libraryRequest("/courses"),
        libraryRequest("/joined"),
        libraryRequest("/mine"),
      ]);
      if (!alive.current) return;
      setLibraryCatalog(catalogData.courses || []);
      setLibraryCourses(joinedData.courses || []);
      setLibraryMine(mineData.courses || []);
    } catch {}
  };
  const initialize = async () => {
    setSync({ status: "loading" });
    try {
      const value = await workspaceRequest("POST", { state: stateRef.current });
      let base;
      try {
        base = JSON.parse(localStorage.getItem(accountBaseKey));
      } catch {}
      const merged = base
        ? mergeState(base, stateRef.current, value.state)
        : value.state;
      saveBase(value);
      await loadLibrary();
      if (alive.current) {
        stateRef.current = { ...initialState(), ...merged };
        setState(stateRef.current);
        setReady(true);
        setSync({ status: "saved", date: value.updatedAt });
      }
    } catch (error) {
      if (alive.current) setSync({ status: "error", error: error.message });
    }
  };
  useEffect(() => {
    alive.current = true;
    initialize();
    return () => {
      alive.current = false;
    };
  }, []);
  flushRef.current = async () => {
    if (!alive.current || !server.current || busy.current) return;
    const snapshot = stateRef.current;
    const operations = changes(server.current.state, snapshot);
    if (!operations.length) {
      setSync({ status: "saved", date: server.current.updatedAt });
      return;
    }
    busy.current = true;
    setSync({ status: "saving" });
    let retry = false;
    try {
      const base = server.current.state;
      const value = await workspaceRequest("PATCH", {
        revision: server.current.revision,
        operations,
      });
      const merged = value.conflict
        ? mergeState(base, stateRef.current, value.state)
        : mergeState(snapshot, stateRef.current, value.state);
      saveBase(value);
      if (alive.current) {
        stateRef.current = merged;
        setState(merged);
        setSync({ status: "saved", date: value.updatedAt });
      }
      retry = true;
    } catch (error) {
      if (alive.current) setSync({ status: "error", error: error.message });
    } finally {
      busy.current = false;
      if (retry && alive.current) setTimeout(() => flushRef.current(), 100);
    }
  };
  useEffect(() => {
    if (!ready) return;
    if (server.current && changes(server.current.state, state).length) {
      setSync({ status: "saving" });
    }
    const timer = setTimeout(() => flushRef.current(), 350);
    return () => clearTimeout(timer);
  }, [state, ready]);
  useEffect(() => {
    const refresh = async () => {
      if (!server.current || busy.current || document.hidden) return;
      try {
        const value = await workspaceRequest();
        const merged = mergeState(
          server.current.state,
          stateRef.current,
          value.state,
        );
        saveBase(value);
        stateRef.current = merged;
        setState(merged);
      } catch {}
    };
    const online = () => (server.current ? flushRef.current() : initialize());
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      if (!document.hidden) loadLibrary();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [ready]);
  const [provider, setProvider] = useState({
    configured: false,
    loading: true,
  });
  const [create, setCreate] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(accountStorageKey, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  const notify = (message) => sonnerToast(message);
  const refreshProvider = async (value) => {
    try {
      if (value) {
        setProvider({ ...value, loading: false });
        return value;
      }
      const r = await fetch("/api/provider");
      if (!r.ok) throw new Error();
      const data = await r.json();
      setProvider({ ...data, loading: false });
      return data;
    } catch {
      setProvider({ configured: false, loading: false, unavailable: true });
    }
  };
  const selectProvider = async (id) => {
    const r = await fetch("/api/provider/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "切换模型失败，请重试。");
    return refreshProvider(data);
  };
  useEffect(() => {
    refreshProvider();
  }, []);
  const mergedCourses = new Map();
  for (const course of [...catalog, ...state.customCourses]) {
    mergedCourses.set(course.id, {
      ...course,
      ...state.courseEdits?.[course.id],
    });
  }
  for (const course of libraryCourses) {
    if (!mergedCourses.has(course.id)) mergedCourses.set(course.id, course);
  }
  const courses = [...mergedCourses.values()];
  const activity = (title, type, url) => ({
    id: crypto.randomUUID(),
    title,
    type,
    url,
    date: new Date().toISOString(),
  });
  const join = (id) => {
    if (state.joined.includes(id)) return;
    const c = courses.find((c) => c.id === id);
    setState((s) => ({
      ...s,
      joined: [...s.joined, id],
      activities: [
        activity(`加入课程：${c.title}`, "course", `/course/${id}`),
        ...s.activities,
      ],
    }));
    notify("已加入我的课程");
  };
  const toggleBookmark = (id) => {
    if (!courses.some((course) => course.id === id)) return;
    const saved = state.bookmarks.includes(id);
    setState((s) => ({
      ...s,
      bookmarks: s.bookmarks.includes(id)
        ? s.bookmarks.filter((value) => value !== id)
        : [...s.bookmarks, id],
    }));
    notify(saved ? "已取消收藏" : "已收藏课程");
  };
  const joinLibraryCourse = async (id) => {
    const course = await libraryRequest(
      `/courses/${encodeURIComponent(id)}`,
    );
    if (!stateRef.current.joined.includes(id)) {
      setState((s) => ({
        ...s,
        joined: s.joined.includes(id) ? s.joined : [...s.joined, id],
        activities: [
          activity(`加入课程：${course.title}`, "course", `/course/${id}`),
          ...s.activities,
        ],
      }));
    }
    setLibraryCourses((previous) => [
      ...previous.filter((item) => item.id !== id),
      course,
    ]);
    return course;
  };
  const publishCourse = async (id) => {
    const result = await libraryRequest(
      `/courses/${encodeURIComponent(id)}/publish`,
      { method: "POST" },
    );
    await loadLibrary();
    return result;
  };
  const unpublishCourse = async (id) => {
    const result = await libraryRequest(
      `/courses/${encodeURIComponent(id)}/unpublish`,
      { method: "POST" },
    );
    await loadLibrary();
    return result;
  };
  return (
    <Store.Provider
      value={{
        state,
        setState,
        courses,
        notify,
        storageError,
        sync,
        retrySync: () => (server.current ? flushRef.current() : initialize()),
        provider,
        refreshProvider,
        selectProvider,
        create,
        setCreate,
        searchOpen,
        setSearchOpen,
        activity,
        join,
        toggleBookmark,
        libraryCatalog,
        libraryCourses,
        libraryMine,
        joinLibraryCourse,
        publishCourse,
        unpublishCourse,
        refreshLibrary: loadLibrary,
      }}
    >
      {ready ? (
        children
      ) : (
        <WorkspaceLoading
          stage="workspace"
          error={sync.status === "error" ? sync.error : undefined}
          onRetry={initialize}
        />
      )}
    </Store.Provider>
  );
}
export const useStore = () => useContext(Store);
export const localDate = (date = new Date()) =>
  new Date(date).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
export const dateLabel = (date) =>
  new Date(date).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  });
export async function aiRequest(
  messages,
  kind = "chat",
  signal,
  conversationId,
  providerId,
) {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      kind,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(providerId ? { provider_id: providerId } : {}),
    }),
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401)
      window.dispatchEvent(new Event("knowra-auth-required"));
    throw new Error(data.error || "请求失败，请重试。");
  }
  return data.content;
}
export async function aiStream(
  messages,
  { kind = "chat", signal, conversationId, providerId, onDelta } = {},
) {
  const response = await fetch("/api/ai/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      kind,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(providerId ? { provider_id: providerId } : {}),
    }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401)
      window.dispatchEvent(new Event("knowra-auth-required"));
    throw new Error(data.error || "请求失败，请重试。");
  }
  if (!response.body) throw new Error("当前浏览器不支持流式响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const consume = (frame) => {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }
      if (event.error) throw new Error(event.error);
      if (typeof event.delta === "string") {
        content += event.delta;
        onDelta?.(content);
      }
      if (event.done && typeof event.content === "string") content = event.content;
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) consume(frame);
    }
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }
  return content;
}

export function download(name, text, mime = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { useStore } from "../store";
import { Button } from "../ui";
import { prepareAvatar } from "../lib/profile-avatar";

export function ProfileAvatar() {
  const { state, setState, sync, retrySync } = useStore();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const update = (avatar) => {
    setState((previous) => ({ ...previous, avatar }));
    setChanged(true);
    setError("");
  };
  return (
    <div className="profile-avatar-editor">
      <div className="profile-avatar-preview">
        <img src={state.avatar || "/reference/avatar.svg"} alt="当前个人头像" />
      </div>
      <div className="profile-avatar-details">
        <strong>个人头像</strong>
        <p id="avatar-upload-hint">
          支持 JPG、PNG、WebP，最大 5 MB，将居中裁剪。
        </p>
        <div className="profile-avatar-actions">
          <Button
            icon={Camera}
            loading={busy}
            onClick={() => input.current?.click()}
          >
            {state.avatar ? "更换头像" : "上传头像"}
          </Button>
          {state.avatar && (
            <Button
              variant="ghost"
              icon={RotateCcw}
              disabled={busy}
              onClick={() => update("")}
            >
              恢复默认
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择个人头像"
          aria-describedby="avatar-upload-hint"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || busy) return;
            setBusy(true);
            setError("");
            try {
              update(await prepareAvatar(file));
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {changed && !error && (
          <div className="profile-avatar-status" role="status">
            {sync.status === "error" ? (
              <>
                <span>头像同步失败，已保留本地修改。</span>
                <Button size="sm" variant="ghost" onClick={retrySync}>
                  重新同步
                </Button>
              </>
            ) : sync.status === "saved" ? (
              "头像已保存"
            ) : (
              "正在保存头像…"
            )}
          </div>
        )}
      </div>
    </div>
  );
}

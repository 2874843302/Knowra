import { useRef, useState } from "react";
import { Check, ImagePlus, RotateCcw } from "lucide-react";
import { Button, Cover, Modal } from "../ui";
import { useStore } from "../store";
import { courseCoverChoices, prepareCourseCover } from "../lib/course-cover";

export function CourseCoverEditor({ course, onClose }) {
  const { setState, notify } = useStore();
  const [image, setImage] = useState(course.coverImage || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);
  return (
    <Modal
      title="修改课程封面"
      onClose={onClose}
      className="course-cover-dialog"
    >
      <div className="modal-body course-cover-editor">
        <div className="course-cover-preview">
          <Cover course={{ ...course, coverImage: image }} showMark={false} />
        </div>
        <div className="course-cover-upload">
          <Button
            icon={ImagePlus}
            loading={busy}
            onClick={() => input.current?.click()}
          >
            上传自己的图片
          </Button>
          <Button
            variant="ghost"
            icon={RotateCcw}
            disabled={busy}
            onClick={() => {
              setImage("");
              setError("");
            }}
          >
            恢复默认
          </Button>
        </div>
        <p className="course-cover-hint" id="course-cover-hint">
          JPG、PNG 或 WebP，最大 5 MB。课程卡片和详情页会同步更新。
        </p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择课程封面"
          aria-describedby="course-cover-hint"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || busy) return;
            setBusy(true);
            setError("");
            try {
              setImage(await prepareCourseCover(file));
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
        <div className="course-cover-choices" aria-label="内置课程封面">
          {courseCoverChoices.map(([src, label]) => (
            <button
              type="button"
              key={src}
              aria-label={label}
              aria-pressed={image === src}
              onClick={() => {
                setImage(src);
                setError("");
              }}
              disabled={busy}
            >
              <img src={src} alt="" />
              <span>{label}</span>
              {image === src && (
                <i>
                  <Check size={14} />
                </i>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setState((s) => ({
              ...s,
              courseEdits: {
                ...s.courseEdits,
                [course.id]: {
                  ...s.courseEdits?.[course.id],
                  coverImage: image,
                },
              },
            }));
            notify("课程封面已更新");
            onClose();
          }}
        >
          保存封面
        </Button>
      </div>
    </Modal>
  );
}

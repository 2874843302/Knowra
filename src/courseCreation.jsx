import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, X } from "lucide-react";
import { useStore } from "./store";
import { catalog, lessonsOf } from "./data";
import { Modal, UploadButton, courseImage } from "./ui";
import {
  Button,
  Field,
  IconButton,
  Input,
  Textarea,
} from "./design/primitives";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

// Template/manual creation remain compact alternatives to the generation chat.
export default function CreateCourse({ initial, onClose }) {
  const { setState, notify, activity } = useStore();
  const navigate = useNavigate();
  const [method, setMethod] = useState(initial.method || "template");
  const [title, setTitle] = useState(initial.topic || "");
  const [template, setTemplate] = useState("linear-algebra");
  const [files, setFiles] = useState(initial.files || []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [unitNames, setUnitNames] = useState("基础概念\n核心方法\n实践与复习");
  const submit = () => {
    if (uploading) return;
    if (method === "manual" && !title.trim()) {
      setError("请输入课程名称。");
      return;
    }
    const id = crypto.randomUUID();
    const base = catalog.find((c) => c.id === template);
    const names = unitNames
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (method === "manual" && !names.length) {
      setError("请至少填写一个单元。");
      return;
    }
    const course =
      method === "template"
        ? {
            ...base,
            id,
            title: title.trim() || base.title,
            source: "课程模板",
            curated: false,
          }
        : {
            id,
            title: title.trim(),
            description: "我的自定义学习课程",
            category: "自定义课程",
            source: "自主创建",
            cover: "library",
            level: "自定",
            minutes: names.length * 20,
            units: names.map((name, i) => ({
              title: name,
              lessons: [
                {
                  id: `custom-${i}`,
                  title: name,
                  summary: "整理这一单元的学习内容",
                  points: [],
                  content: "",
                  quiz: null,
                },
              ],
            })),
          };
    setState((s) => ({
      ...s,
      customCourses: [...s.customCourses, course],
      joined: [...s.joined, id],
      materials: { ...s.materials, [id]: files },
      activities: [
        activity(`创建课程：${course.title}`, "course", `/course/${id}`),
        ...s.activities,
      ],
    }));
    notify("课程已创建");
    onClose();
    navigate(`/course/${id}`);
  };
  return (
    <Modal
      title="创建你的课程"
      className="course-creation-modal"
      onClose={onClose}
      wide
    >
      <div className="course-creation-body">
        <Tabs
          value={method}
          onValueChange={(value) => {
            setMethod(value);
            setError("");
          }}
          className="creation-methods"
        >
          <TabsList aria-label="创建方式">
            <TabsTrigger value="template">课程模板</TabsTrigger>
            <TabsTrigger value="manual">自主创建</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="creation-main">
          <Field label="课程名称" htmlFor="course-title">
            <Input
              id="course-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                method === "template"
                  ? "可选，默认使用模板名称"
                  : "给你的课程起个名字"
              }
              maxLength={100}
            />
          </Field>
          {method === "template" ? (
            <Field label="选择模板">
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((c) => (
                    <SelectItem value={c.id} key={c.id}>
                      {c.title}（{lessonsOf(c).length} 讲）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="creation-template-preview">
                <img
                  src={courseImage(catalog.find((c) => c.id === template))}
                  alt=""
                />
                <p>{catalog.find((c) => c.id === template).description}</p>
              </div>
            </Field>
          ) : (
            <Field label="课程单元" htmlFor="course-units" hint="每行一个单元">
              <Textarea
                id="course-units"
                value={unitNames}
                onChange={(e) => setUnitNames(e.target.value)}
                rows={5}
              />
            </Field>
          )}
          <section className="creation-materials" aria-label="课程学习资料">
            <div>
              <FileText size={18} />
              <span>
                <strong>带上你的学习资料</strong>
                <small>可选 · PDF、课件、文档或笔记</small>
              </span>
              <UploadButton
                onBusyChange={setUploading}
                onFiles={(added) =>
                  setFiles((previous) => [...previous, ...added])
                }
                size="sm"
              >
                添加资料
              </UploadButton>
            </div>
            {files.length > 0 && (
              <ul>
                {files.map((file) => (
                  <li key={file.id}>
                    <FileText size={14} />
                    <span>{file.name}</span>
                    <IconButton
                      icon={X}
                      label={`移除${file.name}`}
                      onClick={() =>
                        setFiles(files.filter((f) => f.id !== file.id))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <footer className="modal-footer creation-footer">
        <span>课程将保存到你的学习空间</span>
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          iconRight={ArrowRight}
          disabled={uploading}
          onClick={submit}
        >
          创建课程
        </Button>
      </footer>
    </Modal>
  );
}

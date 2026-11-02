export const researchFixture = {
  queries: ["Vue 3 official guide", "Spring Boot official guide"],
  retrievedAt: "2026-10-27T02:00:00Z",
  engine: "Bing",
  scope: "search_snippets",
  failedQueries: [],
  sources: [
    {
      id: "source-1",
      title: "Vue — Introduction",
      url: "https://vuejs.org/guide/introduction.html",
      snippet: "Build interfaces using components and reactive state.",
      query: "Vue 3 official guide",
    },
    {
      id: "source-2",
      title: "Spring Boot — Reference",
      url: "https://docs.spring.io/spring-boot/",
      snippet: "Build standalone Spring applications and HTTP APIs.",
      query: "Spring Boot official guide",
    },
  ],
};

export const interviewFixture = {
  summary:
    "Vue 负责界面与状态，Spring 负责服务接口。先确认你已有的前后端基础，以及想完成的具体项目。",
  questions: [
    {
      key: "foundation",
      title: "你的 JavaScript 与 Java 基础如何？",
      sourceIds: ["source-1", "source-2"],
      options: [
        ["beginner", "刚刚开始", "还没有写过 JavaScript 或 Java"],
        ["familiar", "接触过一些", "写过 JavaScript，Java 后端较陌生"],
        ["experienced", "已有基础", "写过前后端，希望串起 Vue 与 Spring"],
        ["unsure", "希望推荐", "不确定需要哪些前置知识"],
      ],
    },
    {
      key: "direction",
      title: "你更希望深入哪一段开发流程？",
      sourceIds: ["source-1", "source-2"],
      options: [
        ["frontend", "前端交互", "Vue 组件、响应式与 Pinia 状态管理"],
        ["backend", "后端接口", "Spring Boot、数据库与接口设计"],
        ["fullstack", "全栈联调", "从页面操作到服务接口，打通完整链路"],
        ["unsure", "请帮我推荐", "根据基础选择合适的开发方向"],
      ],
    },
    {
      key: "outcome",
      title: "学完之后，你最想做出什么？",
      sourceIds: [],
      options: [
        ["cart", "购物车项目", "商品列表、加购与订单接口"],
        ["wiki", "知识库应用", "文章管理、搜索与前后端交互"],
        ["unsure", "还没想好", "先用一个最小项目建立完整认识"],
      ],
    },
  ],
};

export async function mockCourseResearch(context, onRequest = () => {}) {
  await context.route("**/api/course-research", (route) => {
    onRequest("web");
    return route.fulfill({ json: researchFixture });
  });
  await context.route("**/api/ai", (route) => {
    const kind = route.request().postDataJSON().kind;
    if (kind === "course_search") {
      onRequest(kind);
      return route.fulfill({
        json: { content: JSON.stringify({ queries: researchFixture.queries }) },
      });
    }
    if (kind === "course_questions") {
      onRequest(kind);
      return route.fulfill({
        json: { content: JSON.stringify(interviewFixture) },
      });
    }
    return route.fallback();
  });
}

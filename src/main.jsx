import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { StoreProvider } from "./store";
import { Shell, GlobalOverlays } from "./ui";
import {
  HomePage,
  CoursesPage,
  FavoritesPage,
  MarketplacePage,
  SettingsPage,
  HistoryPage,
  FeedPage,
  AssistantPage,
} from "./pages";
import { CoursePage, LessonPage } from "./study";
import { CourseCreationPage } from "./courseCreationChat";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "./components/ui/tooltip";
import "./design/tailwind.css";
import { AuthProvider } from "./auth";
import { CourseJobPage } from "./components/course-job-page";

function MainRoutes() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/create/:draftId" element={<CourseCreationPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/course/:id" element={<CoursePage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/assistant/:id?" element={<AssistantPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/generation/:jobId" element={<CourseJobPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </Shell>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <StoreProvider>
              <Routes>
                <Route
                  path="/learn/:courseId/:lessonId"
                  element={<LessonPage />}
                />
                <Route path="*" element={<MainRoutes />} />
              </Routes>
              <GlobalOverlays />
            </StoreProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </MotionConfig>
  </React.StrictMode>,
);

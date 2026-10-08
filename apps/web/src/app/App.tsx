import { HashRouter, Navigate, Route, Routes } from "react-router";
import { EditorRoute } from "./EditorRoute.tsx";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<EditorRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

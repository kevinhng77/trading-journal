import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import ShellAccountStrip from "./ShellAccountStrip";

export default function ShellLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <ShellAccountStrip />
        <div className="main-content-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { Routes, Route } from "react-router-dom";
import ShellLayout from "./components/ShellLayout";
import Dashboard from "./pages/Dashboard";
import ReportsLayout from "./pages/reports/ReportsLayout";
import ReportsOverview from "./pages/reports/ReportsOverview";
import ReportsDetailed from "./pages/reports/ReportsDetailed";
import ReportsCalendar from "./pages/reports/ReportsCalendar";
import ReportsTable from "./pages/reports/ReportsTable";
import ReportsWinLossDays from "./pages/reports/ReportsWinLossDays";
import ReportsDrawdown from "./pages/reports/ReportsDrawdown";
import ReportsCompare from "./pages/reports/ReportsCompare";
import ReportsTagBreakdown from "./pages/reports/ReportsTagBreakdown";
import ReportsAdvancedTab from "./pages/reports/ReportsAdvancedTab";
import Trades from "./pages/Trades";
import TradeDetail from "./pages/TradeDetail";
import Journal from "./pages/Journal";
import TradeImportSettingsPage from "./pages/TradeImportSettingsPage";

function App() {
  return (
    <Routes>
      <Route path="/settings/trade-import" element={<TradeImportSettingsPage />} />
      <Route element={<ShellLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<ReportsLayout />}>
          <Route index element={<ReportsOverview />} />
          <Route path="detailed" element={<ReportsDetailed />} />
          <Route path="calendar" element={<ReportsCalendar />} />
          <Route path="table" element={<ReportsTable />} />
          <Route path="win-loss-days" element={<ReportsWinLossDays />} />
          <Route path="drawdown" element={<ReportsDrawdown />} />
          <Route path="compare" element={<ReportsCompare />} />
          <Route path="tag-breakdown" element={<ReportsTagBreakdown />} />
          <Route path="advanced" element={<ReportsAdvancedTab />} />
        </Route>
        <Route path="/trades/:tradeId" element={<TradeDetail />} />
        <Route path="/trades" element={<Trades />} />
        <Route path="/journal" element={<Journal />} />
      </Route>
    </Routes>
  );
}

export default App;

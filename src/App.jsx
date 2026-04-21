import { Routes, Route, Navigate } from "react-router-dom";
import ShellLayout from "./components/ShellLayout";
import Dashboard from "./pages/Dashboard";
import ReportsLayout from "./pages/reports/ReportsLayout";
import ReportsOverview from "./pages/reports/ReportsOverview";
import ReportsDetailed from "./pages/reports/ReportsDetailed";
import ReportsCalendar from "./pages/reports/ReportsCalendar";
import ReportsWinLossDays from "./pages/reports/ReportsWinLossDays";
import ReportsDrawdown from "./pages/reports/ReportsDrawdown";
import ReportsCompare from "./pages/reports/ReportsCompare";
import ReportsTagBreakdown from "./pages/reports/ReportsTagBreakdown";
import ReportsAdvancedTab from "./pages/reports/ReportsAdvancedTab";
import Trades from "./pages/Trades";
import TradeDetail from "./pages/TradeDetail";
import Journal from "./pages/Journal";
import StarReview from "./pages/StarReview";
import Playbook from "./pages/Playbook";
import SettingsLayout from "./pages/SettingsLayout";
import SettingsGeneralPage from "./pages/SettingsGeneralPage";
import SettingsTradeImportPage from "./pages/SettingsTradeImportPage";
import SettingsTradingAccountPage from "./pages/SettingsTradingAccountPage";
import ImportTradesPage from "./pages/ImportTradesPage";
import DasChartDemo from "./pages/DasChartDemo";

function App() {
  return (
    <Routes>
      <Route path="/chart-das" element={<DasChartDemo />} />
      <Route element={<ShellLayout />}>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<SettingsGeneralPage />} />
          <Route path="trade-import" element={<SettingsTradeImportPage />} />
          <Route path="trading-account" element={<SettingsTradingAccountPage />} />
        </Route>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<ReportsLayout />}>
          <Route index element={<ReportsOverview />} />
          <Route path="detailed" element={<ReportsDetailed />} />
          <Route path="calendar" element={<ReportsCalendar />} />
          <Route path="win-loss-days" element={<ReportsWinLossDays />} />
          <Route path="drawdown" element={<ReportsDrawdown />} />
          <Route path="compare" element={<ReportsCompare />} />
          <Route path="tag-breakdown" element={<ReportsTagBreakdown />} />
          <Route path="advanced" element={<ReportsAdvancedTab />} />
        </Route>
        <Route path="/trades/:tradeId" element={<TradeDetail />} />
        <Route path="/trades" element={<Trades />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/star" element={<StarReview />} />
        <Route path="/playbook" element={<Playbook />} />
        <Route path="/import-trades" element={<ImportTradesPage />} />
      </Route>
    </Routes>
  );
}

export default App;

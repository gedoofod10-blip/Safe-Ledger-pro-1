import { useState, useEffect, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SplashScreen from "./components/SplashScreen";
import { isDeviceLockEnabled } from "./lib/deviceLock";
import { initializeSecurity, getSecurityStatus } from "./lib/security";
import { performDailyBackup } from "./lib/backup";
import MainMenu from "./pages/MainMenu";
import ClientsPage from "./pages/ClientsPage";
import LedgerPage from "./pages/LedgerPage";
import AddTransactionPage from "./pages/AddTransactionPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import RemainingLimitPage from "./pages/RemainingLimitPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [unlocked, setUnlocked] = useState(false);

  const handleUnlock = useCallback(() => setUnlocked(true), []);

  // تهيئة الأمان والنسخ الاحتياطي عند بدء التطبيق
  useEffect(() => {
    initializeSecurity();
    const securityStatus = getSecurityStatus();
    console.log('Security Status:', securityStatus);
    
    // تنفيذ النسخة الاحتياطية اليومية
    performDailyBackup().catch(error => {
      console.error('Daily backup error:', error);
    });
  }, []);

  // Re-lock when app returns from background
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isDeviceLockEnabled()) {
        setUnlocked(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  if (!unlocked) {
    return <SplashScreen onFinish={handleUnlock} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/clients" replace />} />
            <Route path="/menu" element={<MainMenu />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/ledger/:clientId" element={<LedgerPage />} />
            <Route path="/add-transaction" element={<AddTransactionPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/remaining-limit" element={<RemainingLimitPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

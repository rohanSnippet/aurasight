import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Dashboard from "./pages/Dashboard.jsx";
import ScannerScreen from "./pages/ScannerScreen.jsx";
import BottomTabs from "./components/BottomTabs.jsx";
import { recoverStaleInProgress } from "./lib/db.js";
import { startSyncLoop } from "./lib/syncManager.js";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Recover any rows stuck in IN_PROGRESS from a previous crash, then start
    // the long-lived sync loop. Drains opportunistically when online.
    recoverStaleInProgress();
    const stop = startSyncLoop({ intervalMs: 6000 });
    return stop;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="min-h-screen bg-background text-foreground">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/scan" element={<ScannerScreen />} />
              <Route path="/index" element={<Navigate to="/" replace />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <BottomTabs />
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

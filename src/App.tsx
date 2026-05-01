import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import RoleHome from "./pages/RoleHome.tsx";
import Settings from "./pages/Settings.tsx";
import Clients from "./pages/Clients.tsx";
import ReportTemplates from "./pages/ReportTemplates.tsx";
import Meetings from "./pages/Meetings.tsx";
import MeetingDetail from "./pages/MeetingDetail.tsx";
import Admin from "./pages/Admin.tsx";
import Usage from "./pages/Usage.tsx";
import Auth from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />
          <Route path="/cases" element={<ProtectedRoute allow={["appraiser"]}><Index /></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute allow={["appraiser"]}><Clients /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute allow={["appraiser"]}><ReportTemplates /></ProtectedRoute>} />
          <Route path="/meetings" element={<ProtectedRoute allow={["architect", "appraiser"]}><Meetings /></ProtectedRoute>} />
          <Route path="/meetings/:id" element={<ProtectedRoute allow={["architect", "appraiser"]}><MeetingDetail /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allow={["admin"]}><Admin /></ProtectedRoute>} />
          <Route path="/usage" element={<ProtectedRoute allow={["admin"]}><Usage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

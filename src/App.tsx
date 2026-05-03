import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { Loader2 } from "lucide-react";

const Index = lazy(() => import("./pages/Index.tsx"));
const RoleHome = lazy(() => import("./pages/RoleHome.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Clients = lazy(() => import("./pages/Clients.tsx"));
const ReportTemplates = lazy(() => import("./pages/ReportTemplates.tsx"));
const MeetingTemplates = lazy(() => import("./pages/MeetingTemplates.tsx"));
const Recordings = lazy(() => import("./pages/Recordings.tsx"));
const MeetingRecordings = lazy(() => import("./pages/MeetingRecordings.tsx"));
const Meetings = lazy(() => import("./pages/Meetings.tsx"));
const MeetingDetail = lazy(() => import("./pages/MeetingDetail.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminUsers = lazy(() => import("./pages/AdminUsers.tsx"));
const Usage = lazy(() => import("./pages/Usage.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const PhoneCallsPage = lazy(() => import("./pages/PhoneCallsPage.tsx"));
const PhotosPage = lazy(() => import("./pages/PhotosPage.tsx"));
const TranscriptsPage = lazy(() => import("./pages/TranscriptsPage.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />
              <Route path="/cases" element={<ProtectedRoute allow={["appraiser"]}><Index /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute allow={["appraiser", "architect"]}><Clients /></ProtectedRoute>} />
              <Route path="/recordings" element={<ProtectedRoute allow={["appraiser"]}><Recordings /></ProtectedRoute>} />
              <Route path="/templates" element={<ProtectedRoute allow={["appraiser"]}><ReportTemplates /></ProtectedRoute>} />
              <Route path="/meeting-templates" element={<ProtectedRoute allow={["architect"]}><MeetingTemplates /></ProtectedRoute>} />
              <Route path="/meeting-recordings" element={<ProtectedRoute allow={["architect"]}><MeetingRecordings /></ProtectedRoute>} />
              <Route path="/meetings" element={<ProtectedRoute allow={["architect"]}><Meetings /></ProtectedRoute>} />
              <Route path="/meetings/:id" element={<ProtectedRoute allow={["architect"]}><MeetingDetail /></ProtectedRoute>} />
              <Route path="/phone-calls" element={<ProtectedRoute allow={["appraiser"]}><PhoneCallsPage workspace="appraiser" title="שיחות טלפון" /></ProtectedRoute>} />
              <Route path="/photos" element={<ProtectedRoute allow={["appraiser"]}><PhotosPage workspace="appraiser" title="תמונות" /></ProtectedRoute>} />
              <Route path="/meeting-phone-calls" element={<ProtectedRoute allow={["architect"]}><PhoneCallsPage workspace="architect" title="שיחות טלפון" /></ProtectedRoute>} />
              <Route path="/meeting-photos" element={<ProtectedRoute allow={["architect"]}><PhotosPage workspace="architect" title="תמונות פגישות" /></ProtectedRoute>} />
              <Route path="/transcripts" element={<ProtectedRoute><TranscriptsPage workspace="appraiser" /></ProtectedRoute>} />
              <Route path="/meeting-transcripts" element={<ProtectedRoute><TranscriptsPage workspace="architect" title="תמלולי פגישות" /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute allow={["admin"]}><Admin /></ProtectedRoute>} />
              <Route path="/usage" element={<ProtectedRoute allow={["admin"]}><Usage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';
import { Dashboard } from '@/pages/Dashboard';
import { Companies } from '@/pages/Companies';
import { Contacts } from '@/pages/Contacts';
import { Services } from '@/pages/Services';
import { Orders } from '@/pages/Orders';
import { Opportunities } from '@/pages/Opportunities';
import { Tasks } from '@/pages/Tasks';
import { Timesheets } from '@/pages/Timesheets';
// Project module
import { Projects } from '@/pages/Projects';
import { ProjectDetail } from '@/pages/ProjectDetail';
import { ProjectWBS } from '@/pages/ProjectWBS';
import { ProjectGantt } from '@/pages/ProjectGantt';
import { ProjectMilestones } from '@/pages/ProjectMilestones';
import { ProjectTeam } from '@/pages/ProjectTeam';
import { ProjectTimesheets } from '@/pages/ProjectTimesheets';
import { ProjectDocuments } from '@/pages/ProjectDocuments';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="companies" element={<Companies />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="services" element={<Services />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="orders" element={<Orders />} />
        
        {/* Project module with nested routes */}
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:projectId" element={<ProjectDetail />}>
          <Route path="wbs" element={<ProjectWBS />} />
          <Route path="gantt" element={<ProjectGantt />} />
          <Route path="milestones" element={<ProjectMilestones />} />
          <Route path="team" element={<ProjectTeam />} />
          <Route path="timesheets" element={<ProjectTimesheets />} />
          <Route path="documents" element={<ProjectDocuments />} />
        </Route>
        
        <Route path="tasks" element={<Tasks />} />
        <Route path="timesheets" element={<Timesheets />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
// v1767187800

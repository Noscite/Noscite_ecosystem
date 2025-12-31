import { useParams, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  LayoutDashboard, 
  ListTree, 
  GanttChart, 
  Flag, 
  Users, 
  Clock, 
  FileText,
  Calendar,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/api/client';

const projectsApi = {
  get: (id: string) => api.get(`/projects/${id}`),
};

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: projectResponse, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  const project = projectResponse?.data;
  
  // Determina quale tab è attivo
  const currentPath = location.pathname;
  const getActiveTab = () => {
    if (currentPath.endsWith('/wbs')) return 'wbs';
    if (currentPath.endsWith('/gantt')) return 'gantt';
    if (currentPath.endsWith('/milestones')) return 'milestones';
    if (currentPath.endsWith('/team')) return 'team';
    if (currentPath.endsWith('/timesheets')) return 'timesheets';
    if (currentPath.endsWith('/documents')) return 'documents';
    return 'dashboard';
  };
  
  const activeTab = getActiveTab();
  const isMainPage = activeTab === 'dashboard';

  const navItems = [
    { id: 'dashboard', path: `/projects/${projectId}`, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'wbs', path: `/projects/${projectId}/wbs`, label: 'WBS / Task', icon: ListTree },
    { id: 'gantt', path: `/projects/${projectId}/gantt`, label: 'Gantt', icon: GanttChart },
    { id: 'milestones', path: `/projects/${projectId}/milestones`, label: 'Milestone', icon: Flag },
    { id: 'team', path: `/projects/${projectId}/team`, label: 'Team', icon: Users },
    { id: 'timesheets', path: `/projects/${projectId}/timesheets`, label: 'Timesheet', icon: Clock },
    { id: 'documents', path: `/projects/${projectId}/documents`, label: 'Documenti', icon: FileText },
  ];

  const handleTabClick = (path: string) => {
    navigate(path);
  };

  if (isLoading) {
    return <div className="text-center py-8">Caricamento progetto...</div>;
  }

  if (!project) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-4">Progetto non trovato</p>
        <Button onClick={() => navigate('/projects')}>Torna ai progetti</Button>
      </div>
    );
  }

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('it-IT');
  };

  const formatPrice = (price: any) => {
    const num = parseFloat(price);
    return isNaN(num) ? '0.00' : num.toLocaleString('it-IT', { minimumFractionDigits: 2 });
  };

  const daysRemaining = project.planned_end_date 
    ? Math.ceil((new Date(project.planned_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color || '#3B82F6' }} />
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <span className="text-gray-500 font-mono">{project.code}</span>
          </div>
          {project.company_name && <p className="text-gray-600 mt-1">{project.company_name}</p>}
        </div>
        <span className={`px-3 py-1 rounded-full text-sm ${
          project.status === 'planning' ? 'bg-gray-100 text-gray-800' :
          project.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
          project.status === 'on_hold' ? 'bg-orange-100 text-orange-800' :
          project.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {project.status === 'planning' ? 'Pianificazione' :
           project.status === 'in_progress' ? 'In Corso' :
           project.status === 'on_hold' ? 'Sospeso' :
           project.status === 'completed' ? 'Completato' : 'Annullato'}
        </span>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.path)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content Area */}
      {isMainPage ? (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Progresso</p>
                    <p className="text-3xl font-bold">{project.progress_percentage || 0}%</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${project.progress_percentage || 0}%`, backgroundColor: project.color || '#3B82F6' }} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Task Completati</p>
                    <p className="text-3xl font-bold">{project.completed_tasks || 0}<span className="text-lg text-gray-400">/{project.total_tasks || 0}</span></p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Milestone</p>
                    <p className="text-3xl font-bold">{project.completed_milestones || 0}<span className="text-lg text-gray-400">/{project.total_milestones || 0}</span></p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <Flag className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Giorni Rimanenti</p>
                    <p className={`text-3xl font-bold ${daysRemaining !== null && daysRemaining < 0 ? 'text-red-600' : ''}`}>
                      {daysRemaining !== null ? (daysRemaining < 0 ? `${Math.abs(daysRemaining)} ritardo` : daysRemaining) : '-'}
                    </p>
                  </div>
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center ${daysRemaining !== null && daysRemaining < 0 ? 'bg-red-100' : 'bg-orange-100'}`}>
                    <Calendar className={`h-6 w-6 ${daysRemaining !== null && daysRemaining < 0 ? 'text-red-600' : 'text-orange-600'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Project Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Dettagli Progetto</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <div className="flex justify-between"><dt className="text-gray-500">Codice</dt><dd className="font-mono">{project.code}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Metodologia</dt><dd className="capitalize">{project.methodology || 'Waterfall'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Data Inizio Prevista</dt><dd>{formatDate(project.planned_start_date)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Data Fine Prevista</dt><dd>{formatDate(project.planned_end_date)}</dd></div>
                  {project.order_number && <div className="flex justify-between"><dt className="text-gray-500">Commessa</dt><dd className="font-mono">{project.order_number}</dd></div>}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Budget</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <div className="flex justify-between"><dt className="text-gray-500">Budget Totale</dt><dd className="font-semibold">€{formatPrice(project.budget)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Costo Effettivo</dt><dd className="font-semibold">€{formatPrice(project.actual_cost || 0)}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Rimanente</dt>
                    <dd className={`font-semibold ${(project.budget || 0) - (project.actual_cost || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      €{formatPrice((project.budget || 0) - (project.actual_cost || 0))}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {project.description && (
            <Card>
              <CardHeader><CardTitle>Descrizione</CardTitle></CardHeader>
              <CardContent><p className="text-gray-700 whitespace-pre-wrap">{project.description}</p></CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Outlet context={{ project }} />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Clock, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';

const timesheetsApi = {
  list: (params?: Record<string, any>) => api.get('/timesheets', { params }),
  create: (data: any) => api.post('/timesheets', data),
  update: (id: string, data: any) => api.put(`/timesheets/${id}`, data),
  delete: (id: string) => api.delete(`/timesheets/${id}`),
};

const projectsApi = { list: () => api.get('/projects') };
const tasksApi = { listByProject: (projectId: string) => api.get(`/tasks/by-project/${projectId}`) };

interface Timesheet {
  id?: string;
  project_id: string;
  task_id?: string | null;
  user_id: string;
  work_date: string;
  hours: number;
  activity_type: string;
  is_billable: boolean;
  description?: string;
}

const activityTypes = [
  { value: 'development', label: 'Sviluppo' },
  { value: 'design', label: 'Design' },
  { value: 'analysis', label: 'Analisi' },
  { value: 'testing', label: 'Testing' },
  { value: 'meeting', label: 'Riunione' },
  { value: 'documentation', label: 'Documentazione' },
  { value: 'support', label: 'Supporto' },
  { value: 'management', label: 'Gestione' },
  { value: 'other', label: 'Altro' },
];

const statusColors: Record<string, string> = { draft: 'bg-gray-100 text-gray-800', submitted: 'bg-yellow-100 text-yellow-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800' };

export function Timesheets() {
  const { user } = useAuth();
  const [filterProject, setFilterProject] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTs, setEditingTs] = useState<Timesheet | null>(null);
  const [formData, setFormData] = useState<Timesheet>({ project_id: '', task_id: null, user_id: user?.id || '', work_date: new Date().toISOString().split('T')[0], hours: 1, activity_type: 'development', is_billable: true, description: '' });
  const [projectTasks, setProjectTasks] = useState<any[]>([]);
  const queryClient = useQueryClient();

  const { data: timesheets, isLoading } = useQuery({ queryKey: ['timesheets', filterProject], queryFn: () => timesheetsApi.list({ project_id: filterProject || undefined }) });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });

  const createMutation = useMutation({
    mutationFn: (data: any) => timesheetsApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['timesheets'] }); setIsDialogOpen(false); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => timesheetsApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['timesheets'] }); setIsDialogOpen(false); setEditingTs(null); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => timesheetsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
  });

  const resetForm = () => { setFormData({ project_id: '', task_id: null, user_id: user?.id || '', work_date: new Date().toISOString().split('T')[0], hours: 1, activity_type: 'development', is_billable: true, description: '' }); setProjectTasks([]); };

  const handleProjectChange = async (projectId: string) => {
    setFormData({ ...formData, project_id: projectId, task_id: null });
    if (projectId) { const res = await tasksApi.listByProject(projectId); setProjectTasks(res.data || []); }
    else { setProjectTasks([]); }
  };

  const handleOpenCreate = () => { setEditingTs(null); resetForm(); setIsDialogOpen(true); };

  const handleOpenEdit = async (ts: Timesheet) => {
    setEditingTs(ts);
    setFormData({ ...ts, work_date: ts.work_date?.split('T')[0] || '' });
    if (ts.project_id) { const res = await tasksApi.listByProject(ts.project_id); setProjectTasks(res.data || []); }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_id) { alert('Seleziona un progetto'); return; }
    const dataToSend = { ...formData, user_id: user?.id, task_id: formData.task_id || null, hours: parseFloat(String(formData.hours)) };
    if (editingTs?.id) { updateMutation.mutate({ id: editingTs.id, data: dataToSend }); }
    else { createMutation.mutate(dataToSend); }
  };

  const handleDelete = (id: string) => { if (confirm('Eliminare?')) deleteMutation.mutate(id); };

  const getProjectName = (pid: string) => projects?.data?.find((p: any) => p.id === pid)?.name || '-';
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Timesheet</h1>
        <Button onClick={handleOpenCreate}><Plus className="h-4 w-4 mr-2" />Nuova Registrazione</Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm">
              <option value="">Tutti i progetti</option>
              {projects?.data?.map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="text-center py-8">Caricamento...</div>) : timesheets?.data?.length === 0 ? (<div className="text-center py-8 text-gray-500">Nessun timesheet trovato</div>) : (
            <table className="w-full">
              <thead><tr className="border-b"><th className="text-left py-3 px-4 font-medium">Data</th><th className="text-left py-3 px-4 font-medium">Progetto</th><th className="text-left py-3 px-4 font-medium">Attività</th><th className="text-left py-3 px-4 font-medium">Descrizione</th><th className="text-left py-3 px-4 font-medium">Ore</th><th className="text-left py-3 px-4 font-medium">Stato</th><th className="text-left py-3 px-4 font-medium">Azioni</th></tr></thead>
              <tbody>
                {timesheets?.data?.map((ts: any) => (
                  <tr key={ts.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100"><Clock className="h-5 w-5 text-cyan-600" /></div><span className="font-medium">{formatDate(ts.work_date)}</span></div></td>
                    <td className="py-3 px-4 text-gray-600">{getProjectName(ts.project_id)}</td>
                    <td className="py-3 px-4">{activityTypes.find(a => a.value === ts.activity_type)?.label || ts.activity_type}</td>
                    <td className="py-3 px-4 text-gray-600 max-w-xs truncate">{ts.description || '-'}</td>
                    <td className="py-3 px-4 font-medium">{ts.hours}h</td>
                    <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs ${statusColors[ts.status] || statusColors.draft}`}>{ts.status}</span></td>
                    <td className="py-3 px-4"><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => handleOpenEdit(ts)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDelete(ts.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingTs ? 'Modifica' : 'Nuova Registrazione'}</DialogTitle><DialogDescription>Registra le ore lavorate</DialogDescription></DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Progetto *</Label><select value={formData.project_id} onChange={(e) => handleProjectChange(e.target.value)} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" required><option value="">Seleziona...</option>{projects?.data?.map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
                <div className="space-y-2"><Label>Task (opzionale)</Label><select value={formData.task_id || ''} onChange={(e) => setFormData({ ...formData, task_id: e.target.value || null })} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" disabled={!formData.project_id}><option value="">Nessuno</option>{projectTasks.map((t: any) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Data *</Label><Input type="date" value={formData.work_date} onChange={(e) => setFormData({ ...formData, work_date: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Ore *</Label><Input type="number" step="0.25" min="0.25" max="24" value={formData.hours} onChange={(e) => setFormData({ ...formData, hours: parseFloat(e.target.value) || 0 })} required /></div>
                <div className="space-y-2"><Label>Tipo Attività</Label><select value={formData.activity_type} onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">{activityTypes.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></div>
              </div>
              <div className="space-y-2"><Label>Descrizione</Label><Textarea value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Descrivi le attività..." /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={formData.is_billable} onChange={(e) => setFormData({ ...formData, is_billable: e.target.checked })} className="h-4 w-4" /><Label>Fatturabile</Label></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annulla</Button><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Salva</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

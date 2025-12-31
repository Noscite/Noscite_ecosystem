import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, CheckSquare, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';

const tasksApi = {
  list: (params?: Record<string, any>) => api.get('/tasks', { params }),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.put(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

const projectsApi = { list: () => api.get('/projects') };

interface Task {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  planned_start_date?: string;
  planned_end_date?: string;
  estimated_hours?: number;
  progress_percentage?: number;
  is_milestone?: boolean;
}

const emptyTask: Task = { project_id: '', name: '', status: 'todo', priority: 'medium', progress_percentage: 0 };

const statusOptions = [
  { value: 'todo', label: 'Da Fare', color: 'bg-gray-100 text-gray-800' },
  { value: 'in_progress', label: 'In Corso', color: 'bg-blue-100 text-blue-800' },
  { value: 'review', label: 'In Revisione', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'completed', label: 'Completato', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Annullato', color: 'bg-red-100 text-red-800' },
];

const priorityOptions = [
  { value: 'low', label: 'Bassa', color: 'bg-gray-100 text-gray-800' },
  { value: 'medium', label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'high', label: 'Alta', color: 'bg-orange-100 text-orange-800' },
  { value: 'critical', label: 'Critica', color: 'bg-red-100 text-red-800' },
];

export function Tasks() {
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<Task>(emptyTask);
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', search, filterProject],
    queryFn: () => tasksApi.list({ search: search || undefined, project_id: filterProject || undefined }),
  });

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });

  const createMutation = useMutation({
    mutationFn: (data: any) => tasksApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); setIsDialogOpen(false); setFormData(emptyTask); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tasksApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); setIsDialogOpen(false); setEditingTask(null); setFormData(emptyTask); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const handleOpenCreate = () => { setEditingTask(null); setFormData(emptyTask); setIsDialogOpen(true); };

  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({ ...task, planned_start_date: task.planned_start_date?.split('T')[0] || '', planned_end_date: task.planned_end_date?.split('T')[0] || '' });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_id) { alert('Seleziona un progetto'); return; }
    const dataToSend = { ...formData, planned_start_date: formData.planned_start_date || null, planned_end_date: formData.planned_end_date || null };
    if (editingTask?.id) { updateMutation.mutate({ id: editingTask.id, data: dataToSend }); }
    else { createMutation.mutate(dataToSend); }
  };

  const handleDelete = (id: string) => { if (confirm('Eliminare questo task?')) deleteMutation.mutate(id); };

  const getStatusInfo = (status: string) => statusOptions.find(s => s.value === status) || statusOptions[0];
  const getPriorityInfo = (priority: string) => priorityOptions.find(p => p.value === priority) || priorityOptions[1];
  const getProjectName = (projectId: string) => projects?.data?.find((p: any) => p.id === projectId)?.name || '-';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Task</h1>
        <Button onClick={handleOpenCreate}><Plus className="h-4 w-4 mr-2" />Nuovo Task</Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Cerca task..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm">
              <option value="">Tutti i progetti</option>
              {projects?.data?.map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="text-center py-8">Caricamento...</div>) : tasks?.data?.length === 0 ? (<div className="text-center py-8 text-gray-500">Nessun task trovato</div>) : (
            <table className="w-full">
              <thead><tr className="border-b"><th className="text-left py-3 px-4 font-medium">Nome</th><th className="text-left py-3 px-4 font-medium">Progetto</th><th className="text-left py-3 px-4 font-medium">Stato</th><th className="text-left py-3 px-4 font-medium">Priorità</th><th className="text-left py-3 px-4 font-medium">Progresso</th><th className="text-left py-3 px-4 font-medium">Azioni</th></tr></thead>
              <tbody>
                {tasks?.data?.map((task: any) => {
                  const statusInfo = getStatusInfo(task.status);
                  const priorityInfo = getPriorityInfo(task.priority);
                  return (
                    <tr key={task.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100"><CheckSquare className="h-5 w-5 text-indigo-600" /></div><span className="font-medium">{task.name}</span></div></td>
                      <td className="py-3 px-4 text-gray-600">{getProjectName(task.project_id)}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs ${statusInfo.color}`}>{statusInfo.label}</span></td>
                      <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs ${priorityInfo.color}`}>{priorityInfo.label}</span></td>
                      <td className="py-3 px-4"><div className="flex items-center gap-2"><div className="w-20 bg-gray-200 rounded-full h-2"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${task.progress_percentage || 0}%` }} /></div><span className="text-sm">{task.progress_percentage || 0}%</span></div></td>
                      <td className="py-3 px-4"><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => handleOpenEdit(task)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDelete(task.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingTask ? 'Modifica Task' : 'Nuovo Task'}</DialogTitle><DialogDescription>{editingTask ? 'Modifica i dati' : 'Inserisci i dati'}</DialogDescription></DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Progetto *</Label><select value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" required><option value="">Seleziona...</option>{projects?.data?.map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
              <div className="space-y-2"><Label>Nome *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Descrizione</Label><Textarea value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Stato</Label><select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">{statusOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></div>
                <div className="space-y-2"><Label>Priorità</Label><select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">{priorityOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></div>
                <div className="space-y-2"><Label>Ore Stimate</Label><Input type="number" step="0.5" value={formData.estimated_hours || ''} onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Data Inizio</Label><Input type="date" value={formData.planned_start_date || ''} onChange={(e) => setFormData({ ...formData, planned_start_date: e.target.value })} /></div>
                <div className="space-y-2"><Label>Data Fine</Label><Input type="date" value={formData.planned_end_date || ''} onChange={(e) => setFormData({ ...formData, planned_end_date: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Progresso (%)</Label><Input type="number" min="0" max="100" value={formData.progress_percentage || ''} onChange={(e) => setFormData({ ...formData, progress_percentage: parseInt(e.target.value) || 0 })} /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={formData.is_milestone || false} onChange={(e) => setFormData({ ...formData, is_milestone: e.target.checked })} className="h-4 w-4" /><Label>È una Milestone</Label></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annulla</Button><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Salva</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Clock, Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';

const timesheetsApi = {
  list: (projectId: string) => api.get(`/timesheets/by-project/${projectId}`),
  create: (data: any) => api.post('/timesheets', data),
  update: (id: string, data: any) => api.put(`/timesheets/${id}`, data),
  delete: (id: string) => api.delete(`/timesheets/${id}`),
};

const tasksApi = {
  list: (projectId: string) => api.get(`/tasks/by-project/${projectId}`),
};

interface Timesheet {
  id?: string;
  project_id: string;
  task_id?: string | null;
  user_id?: string;
  work_date: string;
  hours: number;
  activity_type: string;
  is_billable?: boolean;
  hourly_rate?: number;
  description?: string;
  notes?: string;
  status: string;
  // Computed
  user_name?: string;
  task_name?: string;
}

const emptyTimesheet: Partial<Timesheet> = {
  task_id: '',
  work_date: new Date().toISOString().split('T')[0],
  hours: 1,
  activity_type: 'development',
  is_billable: true,
  description: '',
  notes: '',
};

const activityOptions = [
  { value: 'development', label: 'Sviluppo' },
  { value: 'design', label: 'Design' },
  { value: 'analysis', label: 'Analisi' },
  { value: 'testing', label: 'Testing' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'documentation', label: 'Documentazione' },
  { value: 'support', label: 'Supporto' },
  { value: 'management', label: 'Management' },
  { value: 'training', label: 'Formazione' },
  { value: 'other', label: 'Altro' },
];

const statusOptions = [
  { value: 'draft', label: 'Bozza', color: 'bg-gray-100 text-gray-800' },
  { value: 'submitted', label: 'Inviato', color: 'bg-blue-100 text-blue-800' },
  { value: 'approved', label: 'Approvato', color: 'bg-green-100 text-green-800' },
  { value: 'rejected', label: 'Rifiutato', color: 'bg-red-100 text-red-800' },
];

export function ProjectTimesheets() {
  const { projectId } = useParams<{ projectId: string }>();
  const context = useOutletContext<{ project: any }>();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState<Timesheet | null>(null);
  const [formData, setFormData] = useState<Partial<Timesheet>>(emptyTimesheet);

  const { data: timesheetsResponse, isLoading } = useQuery({
    queryKey: ['timesheets', projectId],
    queryFn: () => timesheetsApi.list(projectId!),
    enabled: !!projectId,
  });

  const { data: tasksResponse } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!),
    enabled: !!projectId,
  });

  const timesheets: Timesheet[] = timesheetsResponse?.data || [];
  const tasks = tasksResponse?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => timesheetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setIsDialogOpen(false);
      setFormData(emptyTimesheet);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => timesheetsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', projectId] });
      setIsDialogOpen(false);
      setEditingTimesheet(null);
      setFormData(emptyTimesheet);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => timesheetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const handleOpenCreate = () => {
    setEditingTimesheet(null);
    setFormData({ ...emptyTimesheet, project_id: projectId });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (timesheet: Timesheet) => {
    setEditingTimesheet(timesheet);
    setFormData({
      ...timesheet,
      work_date: timesheet.work_date ? timesheet.work_date.split('T')[0] : '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSend = {
      ...formData,
      project_id: projectId,
      task_id: formData.task_id || null,
      hours: parseFloat(String(formData.hours)) || 0,
      hourly_rate: formData.hourly_rate ? parseFloat(String(formData.hourly_rate)) : null,
    };
    
    if (editingTimesheet?.id) {
      updateMutation.mutate({ id: editingTimesheet.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (timesheet: Timesheet) => {
    if (confirm('Eliminare questa registrazione ore?')) {
      deleteMutation.mutate(timesheet.id!);
    }
  };

  const getActivityLabel = (type: string) => activityOptions.find(a => a.value === type)?.label || type;
  const getStatusInfo = (status: string) => statusOptions.find(s => s.value === status) || statusOptions[0];
  const getTaskName = (taskId?: string | null) => {
    if (!taskId) return '-';
    const task = tasks.find((t: any) => t.id === taskId);
    return task?.name || '-';
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });

  // Group by date
  const groupedTimesheets = timesheets.reduce((groups: Record<string, Timesheet[]>, ts) => {
    const date = ts.work_date?.split('T')[0] || 'unknown';
    if (!groups[date]) groups[date] = [];
    groups[date].push(ts);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedTimesheets).sort((a, b) => b.localeCompare(a));

  // Stats
  const totalHours = timesheets.reduce((sum, ts) => sum + (ts.hours || 0), 0);
  const billableHours = timesheets.filter(ts => ts.is_billable).reduce((sum, ts) => sum + (ts.hours || 0), 0);

  if (isLoading) {
    return <div className="text-center py-8">Caricamento timesheet...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Timesheet</h2>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Registra Ore
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">Ore Totali</p>
                <p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">Ore Fatturabili</p>
                <p className="text-2xl font-bold">{billableHours.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Ore Non Fatturabili</p>
                <p className="text-2xl font-bold">{(totalHours - billableHours).toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {sortedDates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Nessuna registrazione ore</p>
            <Button className="mt-4" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Registra le prime ore
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(date => (
            <Card key={date}>
              <CardHeader className="py-3">
                <CardTitle className="text-base font-medium">
                  {formatDate(date)}
                  <span className="ml-2 text-sm text-gray-500 font-normal">
                    ({groupedTimesheets[date].reduce((sum, ts) => sum + (ts.hours || 0), 0).toFixed(1)}h)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <tbody>
                    {groupedTimesheets[date].map(ts => {
                      const statusInfo = getStatusInfo(ts.status);
                      return (
                        <tr key={ts.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 w-24">
                            <span className="font-mono font-medium">{ts.hours}h</span>
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <span className="font-medium">{getActivityLabel(ts.activity_type)}</span>
                              {ts.description && (
                                <p className="text-sm text-gray-500 truncate max-w-md">{ts.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {getTaskName(ts.task_id)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {ts.is_billable ? (
                              <span className="text-green-600">Fatturabile</span>
                            ) : (
                              <span className="text-gray-400">Non fatt.</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(ts)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(ts)}>
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Timesheet Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTimesheet ? 'Modifica Registrazione' : 'Registra Ore'}</DialogTitle>
            <DialogDescription>
              Inserisci le ore lavorate
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="work_date">Data *</Label>
                  <Input
                    id="work_date"
                    type="date"
                    value={formData.work_date || ''}
                    onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours">Ore *</Label>
                  <Input
                    id="hours"
                    type="number"
                    min="0.25"
                    max="24"
                    step="0.25"
                    value={formData.hours || ''}
                    onChange={(e) => setFormData({ ...formData, hours: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="activity_type">Tipo Attività *</Label>
                <select
                  id="activity_type"
                  value={formData.activity_type || 'development'}
                  onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  {activityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task_id">Task (opzionale)</Label>
                <select
                  id="task_id"
                  value={formData.task_id || ''}
                  onChange={(e) => setFormData({ ...formData, task_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">-- Nessun task --</option>
                  {tasks.map((task: any) => (
                    <option key={task.id} value={task.id}>{task.wbs_code} - {task.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Cosa hai fatto?"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_billable ?? true}
                    onChange={(e) => setFormData({ ...formData, is_billable: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">Fatturabile</span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? 'Salvataggio...' : 'Salva'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

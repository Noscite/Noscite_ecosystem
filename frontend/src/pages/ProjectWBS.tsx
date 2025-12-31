import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, ChevronRight, ChevronDown, Pencil, Trash2, Flag, Building2, X, UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';

const tasksApi = {
  list: (projectId: string) => api.get(`/tasks/by-project/${projectId}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.put(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  bulkAssign: (taskId: string, companyIds: string[], propagate: boolean) => 
    api.post(`/tasks/${taskId}/assignments/bulk?propagate_to_children=${propagate}`, companyIds),
};

const teamApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/team`),
};

interface Assignment {
  company_id: string;
  company_name: string;
  role?: string;
}

interface Task {
  id?: string;
  project_id: string;
  parent_task_id?: string | null;
  wbs_code?: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  planned_start_date?: string;
  planned_end_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  progress_percentage?: number;
  is_milestone?: boolean;
  notes?: string;
  assignments?: Assignment[];
  children?: Task[];
}

const emptyTask: Partial<Task> = {
  name: '', description: '', status: 'todo', priority: 'medium',
  planned_start_date: '', planned_end_date: '', estimated_hours: 0,
  progress_percentage: 0, is_milestone: false, notes: '',
};

const statusOptions = [
  { value: 'todo', label: 'Da fare', color: 'bg-gray-100 text-gray-800' },
  { value: 'in_progress', label: 'In corso', color: 'bg-blue-100 text-blue-800' },
  { value: 'review', label: 'In revisione', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'completed', label: 'Completato', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Annullato', color: 'bg-red-100 text-red-800' },
];

const priorityOptions = [
  { value: 'low', label: 'Bassa', color: 'text-gray-500' },
  { value: 'medium', label: 'Media', color: 'text-blue-500' },
  { value: 'high', label: 'Alta', color: 'text-orange-500' },
  { value: 'urgent', label: 'Urgente', color: 'text-red-500' },
];

export function ProjectWBS() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Task>>(emptyTask);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [propagateAssignments, setPropagateAssignments] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  const { data: tasksResponse, isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!),
    enabled: !!projectId,
  });

  const { data: teamResponse } = useQuery({
    queryKey: ['project-team', projectId],
    queryFn: () => teamApi.list(projectId!),
    enabled: !!projectId,
  });

  const team = teamResponse?.data?.team || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const result = await tasksApi.create(data);
      if (selectedAssignments.length > 0 && result.data.id) {
        await tasksApi.bulkAssign(result.data.id, selectedAssignments, false);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await tasksApi.update(id, data);
      await tasksApi.bulkAssign(id, selectedAssignments, propagateAssignments);
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });

  const resetForm = () => {
    setFormData(emptyTask);
    setEditingTask(null);
    setParentTaskId(null);
    setSelectedAssignments([]);
    setPropagateAssignments(false);
    setShowTeamDropdown(false);
  };

  const openNewTaskDialog = (parentId: string | null = null) => {
    resetForm();
    setParentTaskId(parentId);
    
    if (parentId) {
      const parentTask = findTaskById(parentId, buildTaskTree(tasksResponse?.data || []));
      if (parentTask?.assignments) {
        setSelectedAssignments(parentTask.assignments.map(a => a.company_id));
      }
    }
    
    setIsDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      planned_start_date: task.planned_start_date || '',
      planned_end_date: task.planned_end_date || '',
      estimated_hours: task.estimated_hours || 0,
      progress_percentage: task.progress_percentage || 0,
      is_milestone: task.is_milestone || false,
      notes: task.notes || '',
    });
    setSelectedAssignments(task.assignments?.map(a => a.company_id) || []);
    setPropagateAssignments(false);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const taskData = {
      ...formData,
      project_id: projectId,
      parent_task_id: parentTaskId,
      estimated_hours: formData.estimated_hours || 0,
      progress_percentage: formData.progress_percentage || 0,
      planned_start_date: formData.planned_start_date || null,
      planned_end_date: formData.planned_end_date || null,
    };

    if (editingTask?.id) {
      updateMutation.mutate({ id: editingTask.id, data: taskData });
    } else {
      createMutation.mutate(taskData);
    }
  };

  const addAssignment = (companyId: string) => {
    if (!selectedAssignments.includes(companyId)) {
      setSelectedAssignments([...selectedAssignments, companyId]);
    }
    setShowTeamDropdown(false);
  };

  const removeAssignment = (companyId: string) => {
    setSelectedAssignments(selectedAssignments.filter(id => id !== companyId));
  };

  const getTeamMemberInfo = (companyId: string) => {
    return team.find((m: any) => m.company_id === companyId);
  };

  const availableTeamMembers = team.filter((m: any) => !selectedAssignments.includes(m.company_id));

  const findTaskById = (id: string, tasks: Task[]): Task | null => {
    for (const task of tasks) {
      if (task.id === id) return task;
      if (task.children) {
        const found = findTaskById(id, task.children);
        if (found) return found;
      }
    }
    return null;
  };

  const buildTaskTree = (tasks: Task[]): Task[] => {
    const taskMap = new Map<string, Task>();
    const rootTasks: Task[] = [];

    tasks.forEach(task => {
      taskMap.set(task.id!, { ...task, children: [] });
    });

    tasks.forEach(task => {
      const currentTask = taskMap.get(task.id!)!;
      if (task.parent_task_id && taskMap.has(task.parent_task_id)) {
        const parent = taskMap.get(task.parent_task_id)!;
        parent.children = parent.children || [];
        parent.children.push(currentTask);
      } else {
        rootTasks.push(currentTask);
      }
    });

    const sortTasks = (tasks: Task[]): Task[] => {
      return tasks.sort((a, b) => {
        const aCode = a.wbs_code || '';
        const bCode = b.wbs_code || '';
        return aCode.localeCompare(bCode, undefined, { numeric: true });
      }).map(task => ({
        ...task,
        children: task.children ? sortTasks(task.children) : []
      }));
    };

    return sortTasks(rootTasks);
  };

  const toggleExpand = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  };

  const getStatusInfo = (status: string) => statusOptions.find(s => s.value === status) || statusOptions[0];
  const getPriorityInfo = (priority: string) => priorityOptions.find(p => p.value === priority) || priorityOptions[1];

  const taskTree = buildTaskTree(tasksResponse?.data || []);

  useEffect(() => {
    if (tasksResponse?.data) {
      const allIds = new Set<string>(tasksResponse.data.map((t: Task) => t.id!));
      setExpandedTasks(allIds);
    }
  }, [tasksResponse?.data]);

  const renderTask = (task: Task, level: number = 0) => {
    const hasChildren = task.children && task.children.length > 0;
    const isExpanded = expandedTasks.has(task.id!);
    const statusInfo = getStatusInfo(task.status);
    const priorityInfo = getPriorityInfo(task.priority);
    const assignments = task.assignments || [];

    return (
      <div key={task.id}>
        <div 
          className={`grid grid-cols-12 gap-2 py-2 px-3 items-center border-b hover:bg-gray-50 ${
            level === 0 ? 'bg-gray-50 font-medium' : ''
          }`}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          <div className="col-span-1 flex items-center gap-1">
            {hasChildren ? (
              <button onClick={() => toggleExpand(task.id!)} className="p-0.5 hover:bg-gray-200 rounded">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : <span className="w-5" />}
            <span className="text-xs text-gray-500">{task.wbs_code}</span>
          </div>

          <div className="col-span-3 flex items-center gap-2">
            <span className="truncate">{task.name}</span>
            {task.is_milestone && <Flag className="h-3 w-3 text-purple-500" />}
          </div>

          <div className="col-span-2 flex items-center gap-1 flex-wrap">
            {assignments.length > 0 ? (
              assignments.map((a) => (
                <span key={a.company_id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                  <Building2 className="h-2.5 w-2.5" />
                  {a.company_name.split(' ')[0]}
                </span>
              ))
            ) : (
              <span className="text-gray-300 text-xs">-</span>
            )}
          </div>

          <div className="col-span-1">
            <span className={`px-2 py-0.5 rounded-full text-xs ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>

          <div className="col-span-1">
            <span className={`text-xs ${priorityInfo.color}`}>{priorityInfo.label}</span>
          </div>

          <div className="col-span-1 text-xs text-gray-500">{formatDate(task.planned_start_date)}</div>
          <div className="col-span-1 text-xs text-gray-500">{formatDate(task.planned_end_date)}</div>

          <div className="col-span-1 text-xs text-gray-500">
            {Number(task.actual_hours || 0).toFixed(1)}/{Number(task.estimated_hours || 0).toFixed(0)}h
          </div>

          <div className="col-span-1 flex items-center gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openNewTaskDialog(task.id!)}>
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(task)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500"
              onClick={() => { if (confirm('Eliminare questo task?')) deleteMutation.mutate(task.id!); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {hasChildren && isExpanded && task.children!.map(child => renderTask(child, level + 1))}
      </div>
    );
  };

  if (isLoading) return <div className="p-8 text-center">Caricamento...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Work Breakdown Structure </h2>
        <Button onClick={() => openNewTaskDialog(null)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Task
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 py-2 px-3 bg-gray-100 text-xs font-medium text-gray-600">
          <div className="col-span-1">WBS</div>
          <div className="col-span-3">Nome</div>
          <div className="col-span-2">Assegnato a</div>
          <div className="col-span-1">Stato</div>
          <div className="col-span-1">Priorità</div>
          <div className="col-span-1">Inizio</div>
          <div className="col-span-1">Fine</div>
          <div className="col-span-1">Ore</div>
          <div className="col-span-1 text-right">Azioni</div>
        </div>

        {taskTree.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nessun task. Clicca "Nuovo Task" per iniziare.
          </div>
        ) : (
          taskTree.map(task => renderTask(task))
        )}
      </div>

      {/* Task Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? 'Modifica Task' : 'Nuovo Task'}
              {parentTaskId && !editingTask && (
                <span className="text-sm font-normal text-gray-500 ml-2">(sotto-task)</span>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingTask ? 'Modifica i dati del task' : 'Inserisci i dati del nuovo task'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" value={formData.name || ''} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione</Label>
                <Textarea id="description" value={formData.description || ''} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />
              </div>

              {/* Assegnazioni - Nuovo Design */}
              <div className="space-y-2">
                <Label>Assegnato a (Team)</Label>
                
                {/* Membri selezionati come chip */}
                <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded-lg bg-gray-50">
                  {selectedAssignments.length === 0 ? (
                    <span className="text-sm text-gray-400 italic">Nessun membro assegnato</span>
                  ) : (
                    selectedAssignments.map(companyId => {
                      const member = getTeamMemberInfo(companyId);
                      return (
                        <span 
                          key={companyId}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          {member?.company_name || 'Sconosciuto'}
                          {member?.role && <span className="text-xs opacity-70">({member.role})</span>}
                          <button
                            type="button"
                            onClick={() => removeAssignment(companyId)}
                            className="ml-1 p-0.5 hover:bg-blue-200 rounded-full transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Dropdown per aggiungere */}
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTeamDropdown(!showTeamDropdown)}
                    disabled={availableTeamMembers.length === 0}
                    className="w-full justify-start"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    {availableTeamMembers.length === 0 
                      ? 'Tutti i membri sono già assegnati' 
                      : 'Aggiungi membro del team...'}
                  </Button>
                  
                  {showTeamDropdown && availableTeamMembers.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {availableTeamMembers.map((m: any) => (
                        <button
                          key={m.company_id}
                          type="button"
                          onClick={() => addAssignment(m.company_id)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 text-sm"
                        >
                          <Building2 className="h-4 w-4 text-gray-400" />
                          <span>{m.company_name}</span>
                          {m.role && <span className="text-xs text-gray-500">({m.role})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {team.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    ⚠️ Nessun membro nel team del progetto. Vai alla sezione Team per aggiungerne.
                  </p>
                )}

                {editingTask && editingTask.children && editingTask.children.length > 0 && (
                  <label className="flex items-center gap-2 mt-2 text-sm">
                    <input
                      type="checkbox"
                      checked={propagateAssignments}
                      onChange={(e) => setPropagateAssignments(e.target.checked)}
                      className="rounded"
                    />
                    Applica anche ai sotto-task
                  </label>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Stato</Label>
                  <select id="status" value={formData.status || 'todo'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priorità</Label>
                  <select id="priority" value={formData.priority || 'medium'}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                    {priorityOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.is_milestone || false}
                      onChange={(e) => setFormData({ ...formData, is_milestone: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300" />
                    <span className="text-sm">Milestone</span>
                    <Flag className="h-4 w-4 text-purple-500" />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="planned_start_date">Data Inizio</Label>
                  <Input id="planned_start_date" type="date" value={formData.planned_start_date || ''}
                    onChange={(e) => setFormData({ ...formData, planned_start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planned_end_date">Data Fine</Label>
                  <Input id="planned_end_date" type="date" value={formData.planned_end_date || ''}
                    onChange={(e) => setFormData({ ...formData, planned_end_date: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estimated_hours">Ore Stimate</Label>
                  <Input id="estimated_hours" type="number" min="0" step="0.5" 
                    value={formData.estimated_hours || ''}
                    onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="progress_percentage">Progresso (%)</Label>
                  <Input id="progress_percentage" type="number" min="0" max="100" 
                    value={formData.progress_percentage || ''}
                    onChange={(e) => setFormData({ ...formData, progress_percentage: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea id="notes" value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annulla</Button>
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
// Build Wed Dec 31 14:19:14 CET 2025

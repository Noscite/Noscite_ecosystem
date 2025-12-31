import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api } from '@/api/client';

const tasksApi = {
  list: (projectId: string) => api.get(`/tasks/by-project/${projectId}`),
  update: (id: string, data: any) => api.put(`/tasks/${id}`, data),
};

interface Task {
  id: string;
  wbs_code?: string;
  name: string;
  description?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  progress_percentage?: number;
  status: string;
  priority?: string;
  parent_task_id?: string | null;
  is_milestone?: boolean;
  estimated_hours?: number;
  level?: number;
  children?: Task[];
}

type ZoomLevel = 'day' | 'week' | 'month';

const statusOptions = [
  { value: 'todo', label: 'Da fare' },
  { value: 'in_progress', label: 'In corso' },
  { value: 'review', label: 'In revisione' },
  { value: 'completed', label: 'Completato' },
  { value: 'cancelled', label: 'Annullato' },
];

const priorityOptions = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export function ProjectGantt() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [viewOffset, setViewOffset] = useState(0);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<Partial<Task>>({});

  const { data: tasksResponse, isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!),
    enabled: !!projectId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setEditingTask(null);
    },
  });

  const tasks: Task[] = tasksResponse?.data || [];

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      description: task.description || '',
      status: task.status,
      priority: task.priority || 'medium',
      planned_start_date: task.planned_start_date || '',
      planned_end_date: task.planned_end_date || '',
      estimated_hours: task.estimated_hours || 0,
      progress_percentage: task.progress_percentage || 0,
    });
  };

  const handleSave = () => {
    if (!editingTask) return;
    updateMutation.mutate({
      id: editingTask.id,
      data: {
        ...formData,
        estimated_hours: formData.estimated_hours || 0,
        progress_percentage: formData.progress_percentage || 0,
      }
    });
  };

  // Calculate date range
  const { dateRange } = useMemo(() => {
    const validTasks = tasks.filter(t => t.planned_start_date || t.planned_end_date);
    
    let min = new Date();
    let max = new Date();
    
    if (validTasks.length > 0) {
      validTasks.forEach(task => {
        if (task.planned_start_date) {
          const start = new Date(task.planned_start_date);
          if (start < min) min = new Date(start);
        }
        if (task.planned_end_date) {
          const end = new Date(task.planned_end_date);
          if (end > max) max = new Date(end);
        }
      });
    } else {
      min = new Date();
      max = new Date();
      max.setMonth(max.getMonth() + 3);
    }

    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 14);

    const dates: Date[] = [];
    const current = new Date(min);
    while (current <= max) {
      dates.push(new Date(current));
      if (zoomLevel === 'day') {
        current.setDate(current.getDate() + 1);
      } else if (zoomLevel === 'week') {
        current.setDate(current.getDate() + 7);
      } else {
        current.setMonth(current.getMonth() + 1);
      }
    }
    return { dateRange: dates };
  }, [tasks, zoomLevel]);

  // Build task hierarchy
  const taskTree = useMemo(() => {
    const taskMap = new Map<string, Task & { children: Task[]; level: number }>();
    const roots: (Task & { children: Task[]; level: number })[] = [];

    tasks.forEach(task => {
      taskMap.set(task.id, { ...task, children: [], level: 0 });
    });

    tasks.forEach(task => {
      const node = taskMap.get(task.id)!;
      if (task.parent_task_id && taskMap.has(task.parent_task_id)) {
        const parent = taskMap.get(task.parent_task_id)!;
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const flatList: (Task & { level: number })[] = [];
    const flatten = (items: (Task & { children: Task[]; level: number })[]) => {
      items.sort((a, b) => (a.wbs_code || '').localeCompare(b.wbs_code || '', undefined, { numeric: true }));
      items.forEach(item => {
        flatList.push(item);
        if (item.children.length) flatten(item.children as any);
      });
    };
    flatten(roots);

    return flatList;
  }, [tasks]);

  const cellWidth = zoomLevel === 'day' ? 30 : zoomLevel === 'week' ? 60 : 100;
  const visibleCells = Math.min(dateRange.length, 20);
  const displayDates = dateRange.slice(viewOffset, viewOffset + visibleCells);

  const getTaskPosition = (task: Task) => {
    if (!task.planned_start_date || !task.planned_end_date || displayDates.length === 0) return null;
    
    const startDate = new Date(task.planned_start_date);
    const endDate = new Date(task.planned_end_date);
    
    const firstVisibleDate = displayDates[0];
    const lastVisibleDate = displayDates[displayDates.length - 1];
    
    if (endDate < firstVisibleDate || startDate > lastVisibleDate) return null;

    const totalDays = (lastVisibleDate.getTime() - firstVisibleDate.getTime()) / (1000 * 60 * 60 * 24);
    if (totalDays <= 0) return null;
    
    const startOffset = Math.max(0, (startDate.getTime() - firstVisibleDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) + 1;

    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;

    return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` };
  };

  const formatDateHeader = (date: Date) => {
    if (zoomLevel === 'day') {
      return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    } else if (zoomLevel === 'week') {
      return `W${getWeekNumber(date)}`;
    } else {
      return date.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
    }
  };

  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const getBarColors = (task: Task) => {
    const progress = task.progress_percentage || 0;
    
    if (task.is_milestone) {
      return { bg: 'bg-purple-500', fill: 'bg-purple-700' };
    }
    
    if (task.status === 'completed' || progress === 100) {
      return { bg: 'bg-emerald-200', fill: 'bg-emerald-500' };
    }
    
    if (task.status === 'cancelled') {
      return { bg: 'bg-red-200', fill: 'bg-red-400' };
    }

    if (progress === 0) {
      return { bg: 'bg-slate-200', fill: 'bg-slate-400' };
    } else if (progress < 25) {
      return { bg: 'bg-rose-200', fill: 'bg-rose-500' };
    } else if (progress < 50) {
      return { bg: 'bg-orange-200', fill: 'bg-orange-500' };
    } else if (progress < 75) {
      return { bg: 'bg-amber-200', fill: 'bg-amber-500' };
    } else {
      return { bg: 'bg-lime-200', fill: 'bg-lime-500' };
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Caricamento Gantt...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Gantt Chart</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewOffset(Math.max(0, viewOffset - 5))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewOffset(Math.min(Math.max(0, dateRange.length - visibleCells), viewOffset + 5))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="border-l h-6 mx-2" />
          <Button variant={zoomLevel === 'day' ? 'default' : 'outline'} size="sm" onClick={() => setZoomLevel('day')}>
            Giorno
          </Button>
          <Button variant={zoomLevel === 'week' ? 'default' : 'outline'} size="sm" onClick={() => setZoomLevel('week')}>
            Settimana
          </Button>
          <Button variant={zoomLevel === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setZoomLevel('month')}>
            Mese
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className="text-gray-500">Progresso:</span>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-400"></div> 0%</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-rose-500"></div> &lt;25%</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500"></div> 25-50%</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-500"></div> 50-75%</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-lime-500"></div> 75-99%</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500"></div> 100%</div>
        <span className="text-gray-400 ml-4">💡 Clicca su una barra per modificare</span>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {taskTree.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nessun task con date pianificate. Aggiungi task dalla vista WBS.
            </div>
          ) : (
            <div className="min-w-max">
              {/* Header */}
              <div className="flex border-b bg-gray-50">
                <div className="w-72 flex-shrink-0 px-3 py-2 font-medium border-r">Task</div>
                <div className="flex-1 flex">
                  {displayDates.map((date, idx) => (
                    <div key={idx} className="flex-1 px-2 py-2 text-xs text-center border-r text-gray-600" style={{ minWidth: `${cellWidth}px` }}>
                      {formatDateHeader(date)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks */}
              {taskTree.map((task) => {
                const position = getTaskPosition(task);
                const progress = task.progress_percentage || 0;
                const colors = getBarColors(task);
                const hasChildren = (task as any).children?.length > 0;

                return (
                  <div key={task.id} className={`flex border-b hover:bg-gray-50 ${hasChildren ? 'bg-gray-50/50' : ''}`}>
                    {/* Task name - clickable */}
                    <div 
                      className="w-72 flex-shrink-0 px-3 py-2 border-r truncate cursor-pointer hover:bg-blue-50 transition-colors" 
                      style={{ paddingLeft: `${12 + (task.level || 0) * 16}px` }}
                      onClick={() => openEditDialog(task)}
                    >
                      <div className="flex items-center gap-2">
                        {task.is_milestone && <Flag className="h-3 w-3 text-purple-500" />}
                        <span className={`text-sm ${task.is_milestone ? 'font-semibold text-purple-700' : ''} ${hasChildren ? 'font-medium' : ''} hover:text-blue-600`}>
                          {task.name}
                        </span>
                      </div>
                    </div>

                    {/* Gantt bar area */}
                    <div className="flex-1 relative h-10">
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex">
                        {displayDates.map((_, idx) => (
                          <div key={idx} className="flex-1 border-r border-gray-100" style={{ minWidth: `${cellWidth}px` }} />
                        ))}
                      </div>

                      {/* Task bar - clickable */}
                      {position && (
                        <div 
                          className={`absolute top-2 h-6 rounded shadow-sm overflow-hidden ${colors.bg} cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all`}
                          style={{ 
                            left: position.left, 
                            width: task.is_milestone ? '12px' : position.width, 
                            minWidth: task.is_milestone ? '12px' : '24px' 
                          }}
                          onClick={() => openEditDialog(task)}
                          title={`${task.name}\nProgresso: ${progress}%\nStato: ${task.status}\n\nClicca per modificare`}
                        >
                          {/* Progress fill */}
                          {!task.is_milestone && progress > 0 && (
                            <div 
                              className={`absolute inset-y-0 left-0 ${colors.fill} transition-all`}
                              style={{ width: `${progress}%` }}
                            />
                          )}
                          
                          {/* Percentage text */}
                          {!task.is_milestone && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                                {progress}%
                              </span>
                            </div>
                          )}

                          {/* Milestone diamond */}
                          {task.is_milestone && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-2 h-2 bg-white transform rotate-45"></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Modifica Task
              {editingTask?.wbs_code && <span className="text-gray-400 ml-2">({editingTask.wbs_code})</span>}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input 
                value={formData.name || ''} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stato</Label>
                <select 
                  value={formData.status || 'todo'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  {statusOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Priorità</Label>
                <select 
                  value={formData.priority || 'medium'}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  {priorityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Inizio</Label>
                <Input 
                  type="date"
                  value={formData.planned_start_date || ''} 
                  onChange={(e) => setFormData({ ...formData, planned_start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Data Fine</Label>
                <Input 
                  type="date"
                  value={formData.planned_end_date || ''} 
                  onChange={(e) => setFormData({ ...formData, planned_end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ore Stimate</Label>
                <Input 
                  type="number"
                  min="0"
                  step="0.5"
                  value={formData.estimated_hours || ''} 
                  onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Progresso (%)</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="number"
                    min="0"
                    max="100"
                    value={formData.progress_percentage || 0} 
                    onChange={(e) => setFormData({ ...formData, progress_percentage: parseInt(e.target.value) || 0 })}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
            </div>

            {/* Progress slider */}
            <div className="space-y-2">
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={formData.progress_percentage || 0}
                onChange={(e) => setFormData({ ...formData, progress_percentage: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>Annulla</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Salvataggio...' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

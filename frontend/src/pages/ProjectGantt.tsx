import { useState, useMemo } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/api/client';

const tasksApi = {
  list: (projectId: string) => api.get(`/tasks/by-project/${projectId}`),
};

interface Task {
  id: string;
  wbs_code?: string;
  name: string;
  planned_start_date?: string;
  planned_end_date?: string;
  progress_percentage?: number;
  status: string;
  parent_task_id?: string | null;
  is_milestone?: boolean;
  level?: number;
}

type ZoomLevel = 'day' | 'week' | 'month';

export function ProjectGantt() {
  const { projectId } = useParams<{ projectId: string }>();
  const context = useOutletContext<{ project: any }>();
  
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [viewOffset, setViewOffset] = useState(0);

  const { data: tasksResponse, isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!),
    enabled: !!projectId,
  });

  const tasks: Task[] = tasksResponse?.data || [];

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'review': return 'bg-yellow-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-400';
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

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {taskTree.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nessun task con date pianificate. Aggiungi task dalla vista WBS.
            </div>
          ) : (
            <div className="min-w-max">
              <div className="flex border-b bg-gray-50">
                <div className="w-64 flex-shrink-0 px-3 py-2 font-medium border-r">Task</div>
                <div className="flex-1 flex">
                  {displayDates.map((date, idx) => (
                    <div key={idx} className="flex-1 px-2 py-2 text-xs text-center border-r text-gray-600" style={{ minWidth: `${cellWidth}px` }}>
                      {formatDateHeader(date)}
                    </div>
                  ))}
                </div>
              </div>

              {taskTree.map((task) => {
                const position = getTaskPosition(task);
                return (
                  <div key={task.id} className="flex border-b hover:bg-gray-50">
                    <div className="w-64 flex-shrink-0 px-3 py-2 border-r truncate" style={{ paddingLeft: `${12 + (task.level || 0) * 16}px` }}>
                      <div className="flex items-center gap-2">
                        {task.is_milestone && <Flag className="h-3 w-3 text-purple-500" />}
                        <span className={`text-sm ${task.is_milestone ? 'font-semibold text-purple-700' : ''}`}>{task.name}</span>
                      </div>
                    </div>
                    <div className="flex-1 relative h-10">
                      <div className="absolute inset-0 flex">
                        {displayDates.map((_, idx) => (
                          <div key={idx} className="flex-1 border-r border-gray-100" style={{ minWidth: `${cellWidth}px` }} />
                        ))}
                      </div>
                      {position && (
                        <div 
                          className={`absolute top-2 h-6 rounded ${task.is_milestone ? 'bg-purple-500' : getStatusColor(task.status)}`}
                          style={{ left: position.left, width: task.is_milestone ? '8px' : position.width, minWidth: task.is_milestone ? '8px' : '4px' }}
                          title={`${task.name}\n${task.progress_percentage || 0}%`}
                        >
                          {!task.is_milestone && (task.progress_percentage || 0) > 0 && (
                            <div className="absolute inset-y-0 left-0 bg-white/30 rounded-l" style={{ width: `${task.progress_percentage}%` }} />
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

      <div className="mt-4 flex gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2"><div className="w-4 h-3 bg-gray-400 rounded" /><span>Da fare</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-3 bg-blue-500 rounded" /><span>In corso</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-3 bg-green-500 rounded" /><span>Completato</span></div>
        <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-purple-500" /><span>Milestone</span></div>
      </div>
    </div>
  );
}

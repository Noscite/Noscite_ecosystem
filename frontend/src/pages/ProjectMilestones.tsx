import { useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Flag, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';

const milestonesApi = {
  list: (projectId: string) => api.get(`/milestones/by-project/${projectId}`),
  create: (data: any) => api.post('/milestones', data),
  update: (id: string, data: any) => api.put(`/milestones/${id}`, data),
  delete: (id: string) => api.delete(`/milestones/${id}`),
};

interface Milestone {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  milestone_type?: string;
  status: string;
  due_date: string;
  completed_date?: string;
  payment_amount?: number;
  is_paid?: boolean;
  notes?: string;
}

const emptyMilestone: Partial<Milestone> = {
  name: '',
  description: '',
  milestone_type: 'deliverable',
  status: 'pending',
  due_date: '',
  payment_amount: undefined,
  is_paid: false,
  notes: '',
};

const statusOptions = [
  { value: 'pending', label: 'In attesa', color: 'bg-gray-100 text-gray-800', icon: Clock },
  { value: 'in_progress', label: 'In corso', color: 'bg-blue-100 text-blue-800', icon: Clock },
  { value: 'completed', label: 'Completata', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  { value: 'missed', label: 'Mancata', color: 'bg-red-100 text-red-800', icon: AlertCircle },
  { value: 'cancelled', label: 'Annullata', color: 'bg-gray-100 text-gray-500', icon: AlertCircle },
];

const typeOptions = [
  { value: 'deliverable', label: 'Deliverable' },
  { value: 'payment', label: 'Pagamento' },
  { value: 'review', label: 'Review' },
  { value: 'deadline', label: 'Scadenza' },
  { value: 'kickoff', label: 'Kickoff' },
  { value: 'go_live', label: 'Go Live' },
];

export function ProjectMilestones() {
  const { projectId } = useParams<{ projectId: string }>();
  const context = useOutletContext<{ project: any }>();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [formData, setFormData] = useState<Partial<Milestone>>(emptyMilestone);

  const { data: milestonesResponse, isLoading } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: () => milestonesApi.list(projectId!),
    enabled: !!projectId,
  });

  const milestones: Milestone[] = milestonesResponse?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => milestonesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setIsDialogOpen(false);
      setFormData(emptyMilestone);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => milestonesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setIsDialogOpen(false);
      setEditingMilestone(null);
      setFormData(emptyMilestone);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => milestonesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const handleOpenCreate = () => {
    setEditingMilestone(null);
    setFormData({ ...emptyMilestone, project_id: projectId });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    setFormData({
      ...milestone,
      due_date: milestone.due_date ? milestone.due_date.split('T')[0] : '',
      completed_date: milestone.completed_date ? milestone.completed_date.split('T')[0] : '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSend = {
      ...formData,
      project_id: projectId,
      payment_amount: formData.payment_amount || null,
      completed_date: formData.status === 'completed' ? (formData.completed_date || new Date().toISOString().split('T')[0]) : null,
    };
    
    if (editingMilestone?.id) {
      updateMutation.mutate({ id: editingMilestone.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (milestone: Milestone) => {
    if (confirm(`Eliminare la milestone "${milestone.name}"?`)) {
      deleteMutation.mutate(milestone.id!);
    }
  };

  const getStatusInfo = (status: string) => statusOptions.find(s => s.value === status) || statusOptions[0];
  const getTypeInfo = (type?: string) => typeOptions.find(t => t.value === type) || typeOptions[0];

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatPrice = (price: any) => {
    const num = parseFloat(price);
    return isNaN(num) ? '-' : `€${num.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
  };

  const isOverdue = (milestone: Milestone) => {
    if (milestone.status === 'completed' || milestone.status === 'cancelled') return false;
    return new Date(milestone.due_date) < new Date();
  };

  // Sort milestones by due date
  const sortedMilestones = [...milestones].sort((a, b) => 
    new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );

  if (isLoading) {
    return <div className="text-center py-8">Caricamento milestone...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Milestone</h2>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Milestone
        </Button>
      </div>

      {sortedMilestones.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <Flag className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Nessuna milestone definita</p>
            <Button className="mt-4" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Crea la prima milestone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedMilestones.map((milestone) => {
            const statusInfo = getStatusInfo(milestone.status);
            const typeInfo = getTypeInfo(milestone.milestone_type);
            const overdue = isOverdue(milestone);
            const StatusIcon = statusInfo.icon;

            return (
              <Card key={milestone.id} className={`${overdue ? 'border-red-300 bg-red-50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${
                        milestone.status === 'completed' ? 'bg-green-100' :
                        overdue ? 'bg-red-100' : 'bg-purple-100'
                      }`}>
                        <Flag className={`h-6 w-6 ${
                          milestone.status === 'completed' ? 'text-green-600' :
                          overdue ? 'text-red-600' : 'text-purple-600'
                        }`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{milestone.name}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">
                            {typeInfo.label}
                          </span>
                          {overdue && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                              In ritardo
                            </span>
                          )}
                        </div>
                        {milestone.description && (
                          <p className="mt-2 text-gray-600">{milestone.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(milestone)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(milestone)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Scadenza: </span>
                      <span className={`font-medium ${overdue ? 'text-red-600' : ''}`}>
                        {formatDate(milestone.due_date)}
                      </span>
                    </div>
                    {milestone.completed_date && (
                      <div>
                        <span className="text-gray-500">Completata: </span>
                        <span className="font-medium text-green-600">{formatDate(milestone.completed_date)}</span>
                      </div>
                    )}
                    {milestone.payment_amount && (
                      <div>
                        <span className="text-gray-500">Importo: </span>
                        <span className="font-medium">{formatPrice(milestone.payment_amount)}</span>
                        {milestone.is_paid && (
                          <span className="ml-2 text-xs text-green-600">(Pagato)</span>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Milestone Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMilestone ? 'Modifica Milestone' : 'Nuova Milestone'}</DialogTitle>
            <DialogDescription>
              {editingMilestone ? 'Modifica i dati della milestone' : 'Inserisci i dati della nuova milestone'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="milestone_type">Tipo</Label>
                  <select
                    id="milestone_type"
                    value={formData.milestone_type || 'deliverable'}
                    onChange={(e) => setFormData({ ...formData, milestone_type: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    {typeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Stato</Label>
                  <select
                    id="status"
                    value={formData.status || 'pending'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="due_date">Data Scadenza *</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date || ''}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                  />
                </div>
                {formData.status === 'completed' && (
                  <div className="space-y-2">
                    <Label htmlFor="completed_date">Data Completamento</Label>
                    <Input
                      id="completed_date"
                      type="date"
                      value={formData.completed_date || ''}
                      onChange={(e) => setFormData({ ...formData, completed_date: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {formData.milestone_type === 'payment' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="payment_amount">Importo (€)</Label>
                    <Input
                      id="payment_amount"
                      type="number"
                      step="0.01"
                      value={formData.payment_amount || ''}
                      onChange={(e) => setFormData({ ...formData, payment_amount: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-2 flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_paid || false}
                        onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Pagato</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                />
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

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, Plus, Trash2, Edit, Building2, Clock, CheckCircle,
  Mail, Briefcase, Euro, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';

const teamApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/team`),
  available: (projectId: string) => api.get(`/projects/${projectId}/team/available-companies`),
  add: (projectId: string, data: any) => api.post(`/projects/${projectId}/team`, data),
  update: (projectId: string, teamId: string, data: any) => api.put(`/projects/${projectId}/team/${teamId}`, data),
  remove: (projectId: string, teamId: string) => api.delete(`/projects/${projectId}/team/${teamId}`),
};

const companyTypeLabels: Record<string, { label: string; color: string }> = {
  supplier: { label: 'Fornitore', color: 'bg-blue-100 text-blue-800' },
  partner: { label: 'Partner', color: 'bg-green-100 text-green-800' },
  freelance: { label: 'Freelance', color: 'bg-purple-100 text-purple-800' },
};

export function ProjectTeam() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [formData, setFormData] = useState({
    company_id: '',
    role: '',
    hourly_rate: '',
    estimated_hours: '',
    notes: ''
  });

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['project-team', projectId],
    queryFn: () => teamApi.list(projectId!),
    enabled: !!projectId,
  });

  const { data: availableData, isLoading: loadingAvailable } = useQuery({
    queryKey: ['available-companies', projectId],
    queryFn: () => teamApi.available(projectId!),
    enabled: !!projectId && isAddOpen,
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => teamApi.add(projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-team', projectId] });
      queryClient.invalidateQueries({ queryKey: ['available-companies', projectId] });
      setIsAddOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Errore');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: any }) => 
      teamApi.update(projectId!, teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-team', projectId] });
      setIsEditOpen(false);
      setSelectedMember(null);
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Errore');
    }
  });

  const removeMutation = useMutation({
    mutationFn: (teamId: string) => teamApi.remove(projectId!, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-team', projectId] });
      queryClient.invalidateQueries({ queryKey: ['available-companies', projectId] });
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Errore');
    }
  });

  const resetForm = () => {
    setFormData({ company_id: '', role: '', hourly_rate: '', estimated_hours: '', notes: '' });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_id) { alert('Seleziona una azienda'); return; }
    addMutation.mutate({
      company_id: formData.company_id,
      role: formData.role || null,
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
      estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
      notes: formData.notes || null
    });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    updateMutation.mutate({
      teamId: selectedMember.id,
      data: {
        role: formData.role || null,
        hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        notes: formData.notes || null
      }
    });
  };

  const openEdit = (member: any) => {
    setSelectedMember(member);
    setFormData({
      company_id: member.company_id,
      role: member.role || '',
      hourly_rate: member.hourly_rate?.toString() || '',
      estimated_hours: member.estimated_hours?.toString() || '',
      notes: member.notes || ''
    });
    setIsEditOpen(true);
  };

  const team = teamData?.data?.team || [];
  const availableCompanies = availableData?.data?.companies || [];

  const totalEstimatedCost = team.reduce((sum: number, m: any) => {
    if (m.hourly_rate && m.estimated_hours) return sum + (m.hourly_rate * m.estimated_hours);
    return sum;
  }, 0);

  const totalActualHours = team.reduce((sum: number, m: any) => sum + (m.total_actual_hours || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Team di Progetto</h2>
          <p className="text-gray-500">Gestisci i partner, fornitori e freelance del progetto</p>
        </div>
        <Button onClick={() => { resetForm(); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi al Team
        </Button>
      </div>

      {team.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{team.length}</p>
                  <p className="text-sm text-gray-500">Membri Team</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Briefcase className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{team.reduce((s: number, m: any) => s + m.assigned_tasks, 0)}</p>
                  <p className="text-sm text-gray-500">Task Assegnati</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{totalActualHours.toFixed(1)}h</p>
                  <p className="text-sm text-gray-500">Ore Lavorate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Euro className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{totalEstimatedCost.toLocaleString('it-IT')}€</p>
                  <p className="text-sm text-gray-500">Costo Stimato</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">Caricamento...</div>
      ) : team.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Users className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nessun membro nel team</h3>
              <p className="text-gray-500 mb-6">
                Aggiungi partner, fornitori o freelance per collaborare al progetto.
              </p>
              <Button onClick={() => { resetForm(); setIsAddOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Aggiungi il primo membro
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {team.map((member: any) => {
            const typeInfo = companyTypeLabels[member.company_type] || { label: member.company_type, color: 'bg-gray-100 text-gray-800' };
            
            return (
              <Card key={member.id} className={`${!member.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Building2 className="h-6 w-6 text-gray-600" />
                      </div>
                      <div>
                        <h4 className="font-medium">{member.company_name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${typeInfo.color}`}>{typeInfo.label}</span>
                      </div>
                    </div>
                    {!member.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">Inattivo</span>
                    )}
                  </div>

                  {member.role && (
                    <p className="text-sm text-gray-600 mb-2"><strong>Ruolo:</strong> {member.role}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    {member.hourly_rate && (
                      <div className="flex items-center gap-1 text-gray-500">
                        <Euro className="h-3 w-3" />
                        {member.hourly_rate}€/h
                      </div>
                    )}
                    {member.estimated_hours && (
                      <div className="flex items-center gap-1 text-gray-500">
                        <Clock className="h-3 w-3" />
                        {member.estimated_hours}h stimate
                      </div>
                    )}
                  </div>

                  {member.email && (
                    <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </span>
                    </div>
                  )}

                  <div className="pt-3 border-t flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {member.assigned_tasks} task
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-blue-500" />
                        {member.total_actual_hours.toFixed(1)}h
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(member)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeMutation.mutate(member.id)}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi al Team</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Azienda *</Label>
                {loadingAvailable ? (
                  <p className="text-sm text-gray-500">Caricamento...</p>
                ) : availableCompanies.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 border rounded-lg">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>Nessuna azienda disponibile</p>
                    <p className="text-xs">Aggiungi fornitori, partner o freelance</p>
                  </div>
                ) : (
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.company_id}
                    onChange={(e) => setFormData({...formData, company_id: e.target.value})}
                  >
                    <option value="">Seleziona azienda...</option>
                    {availableCompanies.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({companyTypeLabels[c.company_type]?.label || c.company_type})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ruolo nel Progetto</Label>
                <Input
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  placeholder="es: Sviluppo Frontend, Design UI/UX..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tariffa Oraria (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.hourly_rate}
                    onChange={(e) => setFormData({...formData, hourly_rate: e.target.value})}
                    placeholder="50.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ore Stimate</Label>
                  <Input
                    type="number"
                    value={formData.estimated_hours}
                    onChange={(e) => setFormData({...formData, estimated_hours: e.target.value})}
                    placeholder="100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Note aggiuntive..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={addMutation.isPending || !formData.company_id}>
                {addMutation.isPending ? 'Aggiunta...' : 'Aggiungi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Membro Team</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{selectedMember?.company_name}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs ${companyTypeLabels[selectedMember?.company_type]?.color || ''}`}>
                  {companyTypeLabels[selectedMember?.company_type]?.label}
                </span>
              </div>

              <div className="space-y-2">
                <Label>Ruolo nel Progetto</Label>
                <Input
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  placeholder="es: Sviluppo Frontend..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tariffa Oraria (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.hourly_rate}
                    onChange={(e) => setFormData({...formData, hourly_rate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ore Stimate</Label>
                  <Input
                    type="number"
                    value={formData.estimated_hours}
                    onChange={(e) => setFormData({...formData, estimated_hours: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Salvataggio...' : 'Salva'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

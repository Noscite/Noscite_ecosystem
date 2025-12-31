import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FolderKanban, Pencil, Trash2, Calendar, FileText, Upload, Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';

const projectsApi = {
  list: (params?: Record<string, any>) => api.get('/projects', { params }),
  create: (data: any) => api.post('/projects', data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

const aiApi = {
  analyzeAndCreate: (formData: FormData) => api.post('/ai/create-project-from-document', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 2 minuti timeout per analisi AI
  }),
};

interface Project {
  id?: string;
  code?: string;
  name: string;
  description?: string;
  methodology?: string;
  status: string;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  budget?: number | string | null;
  progress_percentage?: number;
  color?: string;
  notes?: string;
  total_tasks?: number;
  completed_tasks?: number;
  total_milestones?: number;
  completed_milestones?: number;
}

const emptyProject: Project = {
  name: '',
  description: '',
  methodology: 'waterfall',
  status: 'planning',
  planned_start_date: '',
  planned_end_date: '',
  budget: '',
  progress_percentage: 0,
  color: '#3B82F6',
  notes: '',
};

const statusOptions = [
  { value: 'planning', label: 'Pianificazione', color: 'bg-gray-100 text-gray-800' },
  { value: 'in_progress', label: 'In Corso', color: 'bg-blue-100 text-blue-800' },
  { value: 'on_hold', label: 'Sospeso', color: 'bg-orange-100 text-orange-800' },
  { value: 'completed', label: 'Completato', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Annullato', color: 'bg-red-100 text-red-800' },
];

const methodologyOptions = [
  { value: 'waterfall', label: 'Waterfall' },
  { value: 'agile', label: 'Agile' },
  { value: 'hybrid', label: 'Hybrid' },
];

export function Projects() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<Project>(emptyProject);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiProjectName, setAiProjectName] = useState('');
  const [aiStatus, setAiStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'creating' | 'done' | 'error'>('idle');
  const [aiProgress, setAiProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', search],
    queryFn: () => projectsApi.list({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsDialogOpen(false);
      setFormData(emptyProject);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsDialogOpen(false);
      setEditingProject(null);
      setFormData(emptyProject);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const aiCreateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setAiStatus('uploading');
      setAiProgress('Caricamento documento...');
      
      // Simuliamo i progressi (l'API è sincrona)
      setTimeout(() => {
        setAiStatus('analyzing');
        setAiProgress('Analisi AI in corso... Questo può richiedere 1-2 minuti.');
      }, 1000);
      
      const response = await aiApi.analyzeAndCreate(formData);
      return response;
    },
    onSuccess: (response) => {
      setAiStatus('done');
      setAiProgress('Progetto creato con successo!');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      
      // Naviga al nuovo progetto dopo 1 secondo
      setTimeout(() => {
        setIsAIDialogOpen(false);
        setAiStatus('idle');
        setAiFile(null);
        setAiProjectName('');
        if (response.data?.project_id) {
          navigate(`/projects/${response.data.project_id}`);
        }
      }, 1500);
    },
    onError: (error: any) => {
      setAiStatus('error');
      setAiProgress(`Errore: ${error.response?.data?.detail || error.message}`);
    },
  });

  const handleOpenCreate = () => {
    setEditingProject(null);
    setFormData(emptyProject);
    setIsDialogOpen(true);
  };

  const handleOpenAICreate = () => {
    setAiFile(null);
    setAiProjectName('');
    setAiStatus('idle');
    setAiProgress('');
    setIsAIDialogOpen(true);
  };

  const handleOpenEdit = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setFormData({
      ...project,
      planned_start_date: project.planned_start_date ? project.planned_start_date.split('T')[0] : '',
      planned_end_date: project.planned_end_date ? project.planned_end_date.split('T')[0] : '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSend = {
      ...formData,
      budget: formData.budget ? parseFloat(String(formData.budget)) : null,
      planned_start_date: formData.planned_start_date || null,
      planned_end_date: formData.planned_end_date || null,
    };
    if (editingProject?.id) {
      updateMutation.mutate({ id: editingProject.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleAISubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiFile) return;

    const formData = new FormData();
    formData.append('file', aiFile);
    if (aiProjectName) {
      formData.append('project_name', aiProjectName);
    }

    aiCreateMutation.mutate(formData);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Sei sicuro di voler eliminare questo progetto?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleProjectClick = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const formatPrice = (price: any) => {
    const num = parseFloat(price);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const getStatusInfo = (status: string) => statusOptions.find(s => s.value === status) || statusOptions[0];
  const formatDate = (date?: string | null) => (!date ? '-' : new Date(date).toLocaleDateString('it-IT'));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Progetti</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOpenAICreate}>
            <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
            Crea da Documento
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Progetto
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Cerca progetti..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (<div className="text-center py-8">Caricamento...</div>) : projects?.data?.length === 0 ? (
        <div className="text-center py-12">
          <FolderKanban className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nessun progetto</h3>
          <p className="text-gray-500 mb-6">Inizia creando il tuo primo progetto</p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={handleOpenAICreate}>
              <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
              Crea da Documento
            </Button>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Crea Manualmente
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects?.data?.map((project: Project) => {
            const statusInfo = getStatusInfo(project.status);
            return (
              <Card key={project.id} className="cursor-pointer hover:shadow-lg transition-shadow border-l-4" style={{ borderLeftColor: project.color || '#3B82F6' }} onClick={() => handleProjectClick(project.id!)}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: `${project.color}20` }}>
                        <FolderKanban className="h-6 w-6" style={{ color: project.color }} />
                      </div>
                      <div><h3 className="font-semibold text-lg">{project.name}</h3><p className="text-sm text-gray-500">{project.code}</p></div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={(e) => handleOpenEdit(project, e)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={(e) => handleDelete(project.id!, e)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${statusInfo.color}`}>{statusInfo.label}</span>
                    <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">{methodologyOptions.find(m => m.value === project.methodology)?.label || 'Waterfall'}</span>
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">Progresso</span><span className="font-medium">{project.progress_percentage || 0}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-2"><div className="h-2 rounded-full transition-all" style={{ width: `${project.progress_percentage || 0}%`, backgroundColor: project.color || '#3B82F6' }} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-600"><FileText className="h-4 w-4" /><span>{project.completed_tasks || 0}/{project.total_tasks || 0} Task</span></div>
                    <div className="flex items-center gap-2 text-gray-600"><Calendar className="h-4 w-4" /><span>{project.completed_milestones || 0}/{project.total_milestones || 0} Milestone</span></div>
                  </div>
                  <div className="mt-4 pt-4 border-t flex justify-between text-sm text-gray-500"><span>Inizio: {formatDate(project.planned_start_date)}</span><span>Fine: {formatDate(project.planned_end_date)}</span></div>
                  {project.budget && <div className="mt-2 text-sm"><span className="text-gray-600">Budget: </span><span className="font-medium">€{formatPrice(project.budget)}</span></div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Nuovo Progetto Manuale */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingProject ? 'Modifica Progetto' : 'Nuovo Progetto'}</DialogTitle><DialogDescription>{editingProject ? 'Modifica i dati del progetto' : 'Inserisci i dati del nuovo progetto'}</DialogDescription></DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="name">Nome *</Label><Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label htmlFor="color">Colore</Label><div className="flex gap-2"><Input id="color" type="color" value={formData.color || '#3B82F6'} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-16 h-9 p-1" /><Input value={formData.color || '#3B82F6'} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="flex-1" /></div></div>
              </div>
              <div className="space-y-2"><Label htmlFor="description">Descrizione</Label><Textarea id="description" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label htmlFor="status">Stato</Label><select id="status" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">{statusOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>
                <div className="space-y-2"><Label htmlFor="methodology">Metodologia</Label><select id="methodology" value={formData.methodology || 'waterfall'} onChange={(e) => setFormData({ ...formData, methodology: e.target.value })} className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">{methodologyOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>
                <div className="space-y-2"><Label htmlFor="budget">Budget (€)</Label><Input id="budget" type="number" step="0.01" value={formData.budget || ''} onChange={(e) => setFormData({ ...formData, budget: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="planned_start_date">Data Inizio Prevista</Label><Input id="planned_start_date" type="date" value={formData.planned_start_date || ''} onChange={(e) => setFormData({ ...formData, planned_start_date: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="planned_end_date">Data Fine Prevista</Label><Input id="planned_end_date" type="date" value={formData.planned_end_date || ''} onChange={(e) => setFormData({ ...formData, planned_end_date: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="notes">Note</Label><Textarea id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annulla</Button><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Salva</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Crea da Documento AI */}
      <Dialog open={isAIDialogOpen} onOpenChange={(open) => { if (!aiCreateMutation.isPending) setIsAIDialogOpen(open); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Crea Progetto da Documento
            </DialogTitle>
            <DialogDescription>
              Carica un documento di progetto (PDF, DOCX, TXT) e l'AI analizzerà il contenuto per creare automaticamente il progetto con WBS, milestone e stime.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleAISubmit}>
            <div className="space-y-4 py-4">
              {aiStatus === 'idle' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ai-project-name">Nome Progetto (opzionale)</Label>
                    <Input 
                      id="ai-project-name" 
                      value={aiProjectName} 
                      onChange={(e) => setAiProjectName(e.target.value)} 
                      placeholder="Verrà estratto dal documento se non specificato"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Documento di Progetto *</Label>
                    <div 
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                        aiFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-purple-500'
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt"
                        onChange={(e) => setAiFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      {aiFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <FileText className="h-8 w-8 text-green-600" />
                          <div className="text-left">
                            <p className="font-medium text-green-700">{aiFile.name}</p>
                            <p className="text-sm text-green-600">{(aiFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                          <p className="text-gray-600">Clicca per caricare o trascina qui il documento</p>
                          <p className="text-sm text-gray-400 mt-1">PDF, DOCX, TXT (max 10MB)</p>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {aiStatus !== 'idle' && (
                <div className="text-center py-8">
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                    aiStatus === 'error' ? 'bg-red-100' : 
                    aiStatus === 'done' ? 'bg-green-100' : 'bg-purple-100'
                  }`}>
                    {aiStatus === 'error' ? (
                      <FileText className="h-8 w-8 text-red-600" />
                    ) : aiStatus === 'done' ? (
                      <Sparkles className="h-8 w-8 text-green-600" />
                    ) : (
                      <Clock className="h-8 w-8 text-purple-600 animate-spin" />
                    )}
                  </div>
                  <p className={`font-medium ${
                    aiStatus === 'error' ? 'text-red-700' : 
                    aiStatus === 'done' ? 'text-green-700' : 'text-purple-700'
                  }`}>
                    {aiProgress}
                  </p>
                  {aiStatus === 'analyzing' && (
                    <div className="mt-4 space-y-2 text-sm text-gray-500">
                      <p>✓ Estrazione testo dal documento</p>
                      <p>✓ Analisi con AI Claude</p>
                      <p className="animate-pulse">→ Generazione WBS e milestone...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              {aiStatus === 'idle' && (
                <>
                  <Button type="button" variant="outline" onClick={() => setIsAIDialogOpen(false)}>
                    Annulla
                  </Button>
                  <Button type="submit" disabled={!aiFile}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analizza e Crea
                  </Button>
                </>
              )}
              {aiStatus === 'error' && (
                <Button type="button" onClick={() => setAiStatus('idle')}>
                  Riprova
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

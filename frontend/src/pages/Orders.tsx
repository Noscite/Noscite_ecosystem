import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Pencil, Trash2, X, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, companiesApi, servicesApi } from '@/api/client';

const ordersApi = {
  list: (params?: Record<string, any>) => api.get('/orders', { params }),
  create: (data: any) => api.post('/orders', data),
  update: (id: string, data: any) => api.put(`/orders/${id}`, data),
  delete: (id: string) => api.delete(`/orders/${id}`),
};

const projectsApi = {
  create: (data: any) => api.post('/projects', data),
  getByOrderId: (orderId: string) => api.get(`/projects/by-order/${orderId}`),
};

interface OrderService {
  id?: string;
  service_id: string;
  quantity: number;
  unit_price: number;
  service?: any;
}

interface Order {
  id?: string;
  order_number?: string;
  company_id?: string | null;
  opportunity_id?: string | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  total_amount?: number | string;
  start_date?: string;
  end_date?: string;
  progress_percentage?: number;
  notes?: string;
  project_id?: string | null;
}

const emptyOrder: Order = {
  title: '',
  company_id: '',
  description: '',
  status: 'draft',
  priority: 'medium',
  total_amount: '',
  start_date: '',
  end_date: '',
  progress_percentage: 0,
  notes: '',
};

const statusOptions = [
  { value: 'draft', label: 'Bozza', color: 'bg-gray-100 text-gray-800' },
  { value: 'confirmed', label: 'Confermata', color: 'bg-blue-100 text-blue-800' },
  { value: 'in_progress', label: 'In Corso', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'on_hold', label: 'Sospesa', color: 'bg-orange-100 text-orange-800' },
  { value: 'completed', label: 'Completata', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Annullata', color: 'bg-red-100 text-red-800' },
];

const priorityOptions = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export function Orders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formData, setFormData] = useState<Order>(emptyOrder);
  const [orderServices, setOrderServices] = useState<OrderService[]>([]);
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', search],
    queryFn: () => ordersApi.list({ search: search || undefined }),
  });

  const { data: companies } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => companiesApi.list({}),
  });

  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => servicesApi.list({}),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Order) => {
      const response = await ordersApi.create(data);
      if (orderServices.length > 0 && response.data?.id) {
        for (const svc of orderServices) {
          await api.post('/order-services', {
            order_id: response.data.id,
            service_id: svc.service_id,
            quantity: svc.quantity,
            unit_price: svc.unit_price,
          });
        }
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsDialogOpen(false);
      setFormData(emptyOrder);
      setOrderServices([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Order }) => {
      const response = await ordersApi.update(id, data);
      try {
        await api.delete(`/order-services/by-order/${id}`);
      } catch (e) { /* ignore */ }
      for (const svc of orderServices) {
        await api.post('/order-services', {
          order_id: id,
          service_id: svc.service_id,
          quantity: svc.quantity,
          unit_price: svc.unit_price,
        });
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsDialogOpen(false);
      setEditingOrder(null);
      setFormData(emptyOrder);
      setOrderServices([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ordersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (order: Order) => {
      const projectData = {
        order_id: order.id,
        name: order.title,
        description: order.description,
        status: 'planning',
        planned_start_date: order.start_date,
        planned_end_date: order.end_date,
        budget: order.total_amount,
      };
      return projectsApi.create(projectData);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Navigate to the new project
      if (response.data?.id) {
        navigate(`/projects/${response.data.id}`);
      }
    },
  });

  const handleOpenCreate = () => {
    setEditingOrder(null);
    setFormData(emptyOrder);
    setOrderServices([]);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = async (order: Order) => {
    setEditingOrder(order);
    setFormData({
      ...order,
      company_id: order.company_id || '',
      start_date: order.start_date ? order.start_date.split('T')[0] : '',
      end_date: order.end_date ? order.end_date.split('T')[0] : '',
    });
    
    if (order.id) {
      try {
        const response = await api.get(`/order-services/by-order/${order.id}`);
        setOrderServices(response.data || []);
      } catch (e) {
        setOrderServices([]);
      }
    } else {
      setOrderServices([]);
    }
    
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSend: Order = {
      ...formData,
      company_id: formData.company_id || undefined,
      total_amount: calculateTotal(),
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
    };
    if (editingOrder?.id) {
      updateMutation.mutate({ id: editingOrder.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questa commessa?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCreateProject = (order: Order) => {
    if (confirm(`Vuoi creare un progetto dalla commessa "${order.title}"?`)) {
      createProjectMutation.mutate(order);
    }
  };

  const handleGoToProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const addService = () => {
    setOrderServices([...orderServices, { service_id: '', quantity: 1, unit_price: 0 }]);
  };

  const removeService = (index: number) => {
    setOrderServices(orderServices.filter((_, i) => i !== index));
  };

  const updateService = (index: number, field: string, value: any) => {
    const updated = [...orderServices];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'service_id' && value) {
      const selectedService = services?.data?.find((s: any) => s.id === value);
      if (selectedService) {
        updated[index].unit_price = parseFloat(selectedService.unit_price) || 0;
      }
    }
    
    setOrderServices(updated);
  };

  const formatPrice = (price: any) => {
    const num = parseFloat(price);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const calculateTotal = () => {
    return orderServices.reduce((total, svc) => {
      return total + (parseFloat(String(svc.unit_price)) * svc.quantity);
    }, 0);
  };

  const getCompanyName = (companyId?: string | null) => {
    if (!companyId || !companies?.data) return '-';
    const company = companies.data.find((c: any) => c.id === companyId);
    return company?.name || '-';
  };

  const getStatusInfo = (status: string) => {
    return statusOptions.find(s => s.value === status) || statusOptions[0];
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Commesse</h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Commessa
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Cerca commesse..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Caricamento...</div>
          ) : orders?.data?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Nessuna commessa trovata</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Numero</th>
                  <th className="text-left py-3 px-4 font-medium">Titolo</th>
                  <th className="text-left py-3 px-4 font-medium">Azienda</th>
                  <th className="text-left py-3 px-4 font-medium">Stato</th>
                  <th className="text-left py-3 px-4 font-medium">Progresso</th>
                  <th className="text-right py-3 px-4 font-medium">Importo</th>
                  <th className="text-right py-3 px-4 font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {orders?.data?.map((order: Order & { project_id?: string }) => {
                  const statusInfo = getStatusInfo(order.status);
                  const hasProject = !!order.project_id;
                  return (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm">{order.order_number}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                            <FileText className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <span className="font-medium">{order.title}</span>
                            {hasProject && (
                              <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                                Ha progetto
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{getCompanyName(order.company_id)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full" 
                              style={{ width: `${order.progress_percentage || 0}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">{order.progress_percentage || 0}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        €{formatPrice(order.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {hasProject ? (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleGoToProject(order.project_id!)}
                              title="Vai al progetto"
                            >
                              <FolderKanban className="h-4 w-4 text-purple-600" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleCreateProject(order)}
                              title="Crea progetto"
                              disabled={createProjectMutation.isPending}
                            >
                              <FolderKanban className="h-4 w-4 text-gray-400 hover:text-purple-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(order)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(order.id!)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Modifica Commessa' : 'Nuova Commessa'}</DialogTitle>
            <DialogDescription>
              {editingOrder ? 'Modifica i dati della commessa' : 'Inserisci i dati della nuova commessa'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titolo *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_id">Azienda *</Label>
                  <select
                    id="company_id"
                    value={formData.company_id || ''}
                    onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Seleziona azienda --</option>
                    {companies?.data?.map((company: any) => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Stato *</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priorita</Label>
                  <select
                    id="priority"
                    value={formData.priority || 'medium'}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {priorityOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start_date">Data Inizio</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date || ''}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">Data Fine</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date || ''}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="progress_percentage">Progresso (%)</Label>
                <Input
                  id="progress_percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progress_percentage || ''}
                  onChange={(e) => setFormData({ ...formData, progress_percentage: parseInt(e.target.value) || 0 })}
                />
              </div>

              {/* Services Section */}
              <div className="space-y-4 border-t pt-4 mt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-semibold">Servizi</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addService}>
                    <Plus className="h-4 w-4 mr-1" />
                    Aggiungi Servizio
                  </Button>
                </div>

                {orderServices.length === 0 ? (
                  <p className="text-gray-500 text-sm">Nessun servizio aggiunto.</p>
                ) : (
                  <div className="space-y-3">
                    {orderServices.map((svc, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <select
                            value={svc.service_id}
                            onChange={(e) => updateService(index, 'service_id', e.target.value)}
                            className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">-- Seleziona servizio --</option>
                            {services?.data?.map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.code} - {s.name} (€{formatPrice(s.unit_price)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            min="0.001"
                            step="0.001"
                            placeholder="Qta"
                            value={svc.quantity}
                            onChange={(e) => updateService(index, 'quantity', parseFloat(e.target.value) || 1)}
                          />
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Prezzo"
                            value={svc.unit_price || ''}
                            onChange={(e) => updateService(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="w-28 text-right font-medium">
                          €{formatPrice(svc.unit_price * svc.quantity)}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeService(index)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex justify-end pt-2 border-t">
                      <span className="font-semibold text-lg">Totale: €{formatPrice(calculateTotal())}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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

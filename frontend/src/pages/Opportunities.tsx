import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, TrendingUp, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, companiesApi, servicesApi } from '@/api/client';

const opportunitiesApi = {
  list: (params?: Record<string, any>) => api.get('/opportunities', { params }),
  create: (data: any) => api.post('/opportunities', data),
  update: (id: string, data: any) => api.put(`/opportunities/${id}`, data),
  delete: (id: string) => api.delete(`/opportunities/${id}`),
};

interface OpportunityService {
  id?: string;
  service_id: string;
  quantity: number;
  unit_price: number;
  service?: any;
}

interface Opportunity {
  id?: string;
  company_id?: string | null;
  title: string;
  description?: string;
  status: string;
  amount?: number | string;
  win_probability?: number;
  expected_close_date?: string;
  notes?: string;
  services?: OpportunityService[];
}

const emptyOpportunity: Opportunity = {
  title: '',
  company_id: '',
  description: '',
  status: 'lead',
  amount: '',
  win_probability: 50,
  expected_close_date: '',
  notes: '',
  services: [],
};

const statusOptions = [
  { value: 'lead', label: 'Lead', color: 'bg-gray-100 text-gray-800' },
  { value: 'qualified', label: 'Qualificata', color: 'bg-blue-100 text-blue-800' },
  { value: 'proposal', label: 'Proposta', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'negotiation', label: 'Negoziazione', color: 'bg-purple-100 text-purple-800' },
  { value: 'won', label: 'Vinta', color: 'bg-green-100 text-green-800' },
  { value: 'lost', label: 'Persa', color: 'bg-red-100 text-red-800' },
];

export function Opportunities() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [formData, setFormData] = useState<Opportunity>(emptyOpportunity);
  const [oppServices, setOppServices] = useState<OpportunityService[]>([]);
  const queryClient = useQueryClient();

  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['opportunities', search],
    queryFn: () => opportunitiesApi.list({ search: search || undefined }),
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
    mutationFn: async (data: Opportunity) => {
      const response = await opportunitiesApi.create(data);
      // Save opportunity services
      if (oppServices.length > 0 && response.data?.id) {
        for (const svc of oppServices) {
          await api.post('/opportunity-services', {
            opportunity_id: response.data.id,
            service_id: svc.service_id,
            quantity: svc.quantity,
            unit_price: svc.unit_price,
          });
        }
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      setIsDialogOpen(false);
      setFormData(emptyOpportunity);
      setOppServices([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Opportunity }) => {
      const response = await opportunitiesApi.update(id, data);
      // Delete existing services and recreate
      try {
        await api.delete(`/opportunity-services/by-opportunity/${id}`);
      } catch (e) { /* ignore */ }
      for (const svc of oppServices) {
        await api.post('/opportunity-services', {
          opportunity_id: id,
          service_id: svc.service_id,
          quantity: svc.quantity,
          unit_price: svc.unit_price,
        });
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      setIsDialogOpen(false);
      setEditingOpportunity(null);
      setFormData(emptyOpportunity);
      setOppServices([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => opportunitiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });

  const handleOpenCreate = () => {
    setEditingOpportunity(null);
    setFormData(emptyOpportunity);
    setOppServices([]);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = async (opp: Opportunity) => {
    setEditingOpportunity(opp);
    setFormData({
      ...opp,
      company_id: opp.company_id || '',
      expected_close_date: opp.expected_close_date ? opp.expected_close_date.split('T')[0] : '',
    });
    
    // Load opportunity services
    if (opp.id) {
      try {
        const response = await api.get(`/opportunity-services/by-opportunity/${opp.id}`);
        setOppServices(response.data || []);
      } catch (e) {
        setOppServices([]);
      }
    } else {
      setOppServices([]);
    }
    
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSend: Opportunity = {
      ...formData,
      company_id: formData.company_id || undefined,
      amount: calculateTotal(),
      win_probability: formData.win_probability || 0,
      expected_close_date: formData.expected_close_date || undefined,
    };
    if (editingOpportunity?.id) {
      updateMutation.mutate({ id: editingOpportunity.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questa opportunita?')) {
      deleteMutation.mutate(id);
    }
  };

  const addService = () => {
    setOppServices([...oppServices, { service_id: '', quantity: 1, unit_price: 0 }]);
  };

  const removeService = (index: number) => {
    setOppServices(oppServices.filter((_, i) => i !== index));
  };

  const updateService = (index: number, field: string, value: any) => {
    const updated = [...oppServices];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-fill price when service is selected
    if (field === 'service_id' && value) {
      const selectedService = services?.data?.find((s: any) => s.id === value);
      if (selectedService) {
        updated[index].unit_price = parseFloat(selectedService.unit_price) || 0;
      }
    }
    
    setOppServices(updated);
  };

  const formatPrice = (price: any) => {
    const num = parseFloat(price);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const calculateTotal = () => {
    return oppServices.reduce((total, svc) => {
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
        <h1 className="text-3xl font-bold">Opportunita</h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Opportunita
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Cerca opportunita..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Caricamento...</div>
          ) : opportunities?.data?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Nessuna opportunita trovata</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Titolo</th>
                  <th className="text-left py-3 px-4 font-medium">Azienda</th>
                  <th className="text-left py-3 px-4 font-medium">Stato</th>
                  <th className="text-left py-3 px-4 font-medium">Probabilita</th>
                  <th className="text-right py-3 px-4 font-medium">Valore</th>
                  <th className="text-right py-3 px-4 font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {opportunities?.data?.map((opp: Opportunity) => {
                  const statusInfo = getStatusInfo(opp.status);
                  return (
                    <tr key={opp.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                            <TrendingUp className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium">{opp.title}</p>
                            {opp.expected_close_date && (
                              <p className="text-sm text-gray-500">
                                Chiusura: {new Date(opp.expected_close_date).toLocaleDateString('it-IT')}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{getCompanyName(opp.company_id)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full" 
                              style={{ width: `${opp.win_probability || 0}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">{opp.win_probability || 0}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        €{formatPrice(opp.amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(opp)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(opp.id!)}>
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
            <DialogTitle>{editingOpportunity ? 'Modifica Opportunita' : 'Nuova Opportunita'}</DialogTitle>
            <DialogDescription>
              {editingOpportunity ? 'Modifica i dati' : 'Inserisci i dati della nuova opportunita'}
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
                  <Label htmlFor="company_id">Azienda</Label>
                  <select
                    id="company_id"
                    value={formData.company_id || ''}
                    onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              <div className="grid grid-cols-3 gap-4">
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
                  <Label htmlFor="win_probability">Probabilita (%)</Label>
                  <Input
                    id="win_probability"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.win_probability || ''}
                    onChange={(e) => setFormData({ ...formData, win_probability: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expected_close_date">Data Chiusura Prevista</Label>
                  <Input
                    id="expected_close_date"
                    type="date"
                    value={formData.expected_close_date || ''}
                    onChange={(e) => setFormData({ ...formData, expected_close_date: e.target.value })}
                  />
                </div>
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

                {oppServices.length === 0 ? (
                  <p className="text-gray-500 text-sm">Nessun servizio aggiunto.</p>
                ) : (
                  <div className="space-y-3">
                    {oppServices.map((svc, index) => (
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

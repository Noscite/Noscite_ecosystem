import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Package, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { servicesApi, api } from '@/api/client';

interface ServiceComposition {
  id?: string;
  child_service_id: string;
  quantity: number;
  unit_price_override?: number | null;
  child_service?: Service;
}

interface Service {
  id?: string;
  code: string;
  name: string;
  description?: string;
  service_type: string;
  unit_price?: number | string;
  unit_of_measure?: string;
  is_active?: boolean;
  compositions?: ServiceComposition[];
}

const emptyService: Service = {
  code: '',
  name: '',
  description: '',
  service_type: 'simple',
  unit_price: '',
  unit_of_measure: 'ore',
  is_active: true,
  compositions: [],
};

export function Services() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState<Service>(emptyService);
  const [compositions, setCompositions] = useState<ServiceComposition[]>([]);
  const queryClient = useQueryClient();

  const { data: services, isLoading } = useQuery({
    queryKey: ['services', search],
    queryFn: () => servicesApi.list({ search: search || undefined }),
  });

  // Get simple services for kit composition
  const simpleServices = services?.data?.filter((s: Service) => s.service_type === 'simple') || [];

  const createMutation = useMutation({
    mutationFn: async (data: Service) => {
      const response = await servicesApi.create(data);
      // If it's a kit, save compositions
      if (data.service_type === 'kit' && compositions.length > 0 && response.data?.id) {
        for (const comp of compositions) {
          await api.post('/service-compositions', {
            parent_service_id: response.data.id,
            child_service_id: comp.child_service_id,
            quantity: comp.quantity,
            unit_price_override: comp.unit_price_override || null,
          });
        }
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setIsDialogOpen(false);
      setFormData(emptyService);
      setCompositions([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Service }) => {
      const response = await servicesApi.update(id, data);
      // Update compositions for kit
      if (data.service_type === 'kit') {
        // Delete existing compositions
        try {
          await api.delete(`/service-compositions/by-parent/${id}`);
        } catch (e) {
          // Ignore if no compositions existed
        }
        // Create new compositions
        for (const comp of compositions) {
          await api.post('/service-compositions', {
            parent_service_id: id,
            child_service_id: comp.child_service_id,
            quantity: comp.quantity,
            unit_price_override: comp.unit_price_override || null,
          });
        }
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setIsDialogOpen(false);
      setEditingService(null);
      setFormData(emptyService);
      setCompositions([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => servicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const handleOpenCreate = () => {
    setEditingService(null);
    setFormData(emptyService);
    setCompositions([]);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = async (service: Service) => {
    setEditingService(service);
    setFormData(service);
    
    // Load compositions if it's a kit
    if (service.service_type === 'kit' && service.id) {
      try {
        const response = await api.get(`/service-compositions/by-parent/${service.id}`);
        setCompositions(response.data || []);
      } catch (e) {
        setCompositions([]);
      }
    } else {
      setCompositions([]);
    }
    
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSend = {
      ...formData,
      unit_price: formData.unit_price ? parseFloat(String(formData.unit_price)) : null,
    };
    if (editingService?.id) {
      updateMutation.mutate({ id: editingService.id, data: dataToSend as Service });
    } else {
      createMutation.mutate(dataToSend as Service);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questo servizio?')) {
      deleteMutation.mutate(id);
    }
  };

  const addComposition = () => {
    setCompositions([...compositions, { child_service_id: '', quantity: 1 }]);
  };

  const removeComposition = (index: number) => {
    setCompositions(compositions.filter((_, i) => i !== index));
  };

  const updateComposition = (index: number, field: string, value: any) => {
    const updated = [...compositions];
    updated[index] = { ...updated[index], [field]: value };
    setCompositions(updated);
  };

  const formatPrice = (price: any) => {
    const num = parseFloat(price);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  // Calculate kit total price
  const calculateKitTotal = () => {
    return compositions.reduce((total, comp) => {
      const service = simpleServices.find((s: Service) => s.id === comp.child_service_id);
      const price = comp.unit_price_override ?? service?.unit_price ?? 0;
      return total + (parseFloat(String(price)) * comp.quantity);
    }, 0);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Servizi</h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Servizio
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Cerca servizi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Caricamento...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Codice</th>
                  <th className="text-left py-3 px-4 font-medium">Nome</th>
                  <th className="text-left py-3 px-4 font-medium">Tipo</th>
                  <th className="text-left py-3 px-4 font-medium">Unita</th>
                  <th className="text-right py-3 px-4 font-medium">Prezzo</th>
                  <th className="text-right py-3 px-4 font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {services?.data?.map((service: Service) => (
                  <tr key={service.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{service.code}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          service.service_type === 'kit' ? 'bg-blue-100' : 'bg-purple-100'
                        }`}>
                          <Package className={`h-5 w-5 ${
                            service.service_type === 'kit' ? 'text-blue-600' : 'text-purple-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium">{service.name}</p>
                          {service.description && (
                            <p className="text-sm text-gray-500 truncate max-w-xs">{service.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        service.service_type === 'kit' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {service.service_type === 'kit' ? 'Kit' : 'Semplice'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{service.unit_of_measure || '-'}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      €{formatPrice(service.unit_price)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(service)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(service.id!)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Modifica Servizio' : 'Nuovo Servizio'}</DialogTitle>
            <DialogDescription>
              {editingService ? 'Modifica i dati del servizio' : 'Inserisci i dati del nuovo servizio'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Codice *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service_type">Tipo *</Label>
                  <select
                    id="service_type"
                    value={formData.service_type}
                    onChange={(e) => {
                      setFormData({ ...formData, service_type: e.target.value });
                      if (e.target.value === 'simple') {
                        setCompositions([]);
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="simple">Semplice</option>
                    <option value="kit">Kit</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
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
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit_price">
                    Prezzo Unitario (€) {formData.service_type === 'kit' && '(calcolato dai componenti)'}
                  </Label>
                  <Input
                    id="unit_price"
                    type="number"
                    step="0.01"
                    value={formData.service_type === 'kit' ? calculateKitTotal().toFixed(2) : (formData.unit_price || '')}
                    onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                    readOnly={formData.service_type === 'kit'}
                    className={formData.service_type === 'kit' ? 'bg-gray-100' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_of_measure">Unita di Misura</Label>
                  <select
                    id="unit_of_measure"
                    value={formData.unit_of_measure || 'ore'}
                    onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ore">Ore</option>
                    <option value="giorni">Giorni</option>
                    <option value="pezzi">Pezzi</option>
                    <option value="licenze">Licenze</option>
                    <option value="mesi">Mesi</option>
                    <option value="una_tantum">Una tantum</option>
                  </select>
                </div>
              </div>

              {/* Kit Composition Section */}
              {formData.service_type === 'kit' && (
                <div className="space-y-4 border-t pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-semibold">Componenti del Kit</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addComposition}>
                      <Plus className="h-4 w-4 mr-1" />
                      Aggiungi
                    </Button>
                  </div>

                  {compositions.length === 0 ? (
                    <p className="text-gray-500 text-sm">Nessun componente aggiunto. Clicca "Aggiungi" per inserire servizi nel kit.</p>
                  ) : (
                    <div className="space-y-3">
                      {compositions.map((comp, index) => {
                        const selectedService = simpleServices.find((s: Service) => s.id === comp.child_service_id);
                        return (
                          <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <select
                                value={comp.child_service_id}
                                onChange={(e) => updateComposition(index, 'child_service_id', e.target.value)}
                                className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                              >
                                <option value="">-- Seleziona servizio --</option>
                                {simpleServices.map((s: Service) => (
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
                                placeholder="Qtà"
                                value={comp.quantity}
                                onChange={(e) => updateComposition(index, 'quantity', parseFloat(e.target.value) || 1)}
                              />
                            </div>
                            <div className="w-32">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Prezzo override"
                                value={comp.unit_price_override || ''}
                                onChange={(e) => updateComposition(index, 'unit_price_override', e.target.value ? parseFloat(e.target.value) : null)}
                              />
                            </div>
                            <div className="w-24 text-right font-medium">
                              €{formatPrice((comp.unit_price_override ?? selectedService?.unit_price ?? 0) * comp.quantity)}
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeComposition(index)}>
                              <X className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        );
                      })}
                      <div className="flex justify-end pt-2 border-t">
                        <span className="font-semibold">Totale Kit: €{formatPrice(calculateKitTotal())}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
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

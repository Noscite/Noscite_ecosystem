import { useQuery } from '@tanstack/react-query';
import { Building2, Users, Package, ClipboardList, TrendingUp, FolderKanban } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { companiesApi, contactsApi, servicesApi, ordersApi, projectsApi } from '@/api/client';

export function Dashboard() {
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => companiesApi.list(),
  });

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.list(),
  });

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => servicesApi.list(),
  });

  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const stats = [
    { title: 'Aziende', value: companies?.data?.length || 0, icon: Building2, color: 'bg-blue-500' },
    { title: 'Contatti', value: contacts?.data?.length || 0, icon: Users, color: 'bg-green-500' },
    { title: 'Servizi', value: services?.data?.length || 0, icon: Package, color: 'bg-purple-500' },
    { title: 'Commesse', value: orders?.data?.length || 0, icon: ClipboardList, color: 'bg-orange-500' },
    { title: 'Progetti', value: projects?.data?.length || 0, icon: FolderKanban, color: 'bg-pink-500' },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`rounded-full p-2 ${stat.color}`}>
                <stat.icon className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ultime Commesse</CardTitle>
          </CardHeader>
          <CardContent>
            {orders?.data?.slice(0, 5).map((order: any) => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">{order.title}</p>
                  <p className="text-sm text-muted-foreground">{order.order_number}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  order.status === 'completed' ? 'bg-green-100 text-green-800' :
                  order.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {order.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ultime Aziende</CardTitle>
          </CardHeader>
          <CardContent>
            {companies?.data?.slice(0, 5).map((company: any) => (
              <div key={company.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">{company.name}</p>
                  <p className="text-sm text-muted-foreground">{company.city}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  company.company_type === 'client' ? 'bg-green-100 text-green-800' :
                  company.company_type === 'partner' ? 'bg-purple-100 text-purple-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {company.company_type}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

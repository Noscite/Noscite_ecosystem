import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Upload, FileText, Trash2, Eye, File, FileSpreadsheet, 
  Clock, CheckCircle, Tag, Sparkles, FileCheck, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';

const documentsApi = {
  list: (projectId: string) => api.get(`/ai/projects/${projectId}/documents`),
  upload: (projectId: string, formData: FormData) => 
    api.post(`/ai/documents/${projectId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    }),
};

const categoryLabels: Record<string, { label: string; color: string }> = {
  contract: { label: 'Contratto', color: 'bg-purple-100 text-purple-800' },
  proposal: { label: 'Proposta', color: 'bg-blue-100 text-blue-800' },
  specification: { label: 'Specifica', color: 'bg-green-100 text-green-800' },
  meeting_notes: { label: 'Verbale', color: 'bg-yellow-100 text-yellow-800' },
  report: { label: 'Report', color: 'bg-orange-100 text-orange-800' },
  invoice: { label: 'Fattura', color: 'bg-red-100 text-red-800' },
  correspondence: { label: 'Corrispondenza', color: 'bg-cyan-100 text-cyan-800' },
  technical_doc: { label: 'Doc. Tecnico', color: 'bg-indigo-100 text-indigo-800' },
  legal: { label: 'Legale', color: 'bg-pink-100 text-pink-800' },
  financial: { label: 'Finanziario', color: 'bg-emerald-100 text-emerald-800' },
  other: { label: 'Altro', color: 'bg-gray-100 text-gray-800' },
};

export function ProjectDocuments() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docDescription, setDocDescription] = useState('');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const { data: documentsData, isLoading } = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn: () => documentsApi.list(projectId!),
    enabled: !!projectId,
    refetchOnMount: 'always',
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => documentsApi.upload(projectId!, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      setIsUploadOpen(false);
      setUploadFile(null);
      setDocName('');
      setDocDescription('');
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      if (!docName) setDocName(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('name', docName || uploadFile.name);
    if (docDescription) formData.append('description', docDescription);
    uploadMutation.mutate(formData);
  };

  const documents = documentsData?.data?.documents || [];
  
  // Get all unique tags for filter
  const allTags: string[] = [...new Set(documents.flatMap((d: any) => d.ai_tags || []))].sort() as string[];
  
  // Filter documents by tag
  const filteredDocs = filterTag 
    ? documents.filter((d: any) => d.ai_tags?.includes(filterTag))
    : documents;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const getFileIcon = (mimeType: string, isSource: boolean) => {
    if (isSource) return <FileCheck className="h-8 w-8 text-purple-500" />;
    if (mimeType?.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />;
    if (mimeType?.includes('word') || mimeType?.includes('document')) return <FileText className="h-8 w-8 text-blue-500" />;
    if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Documenti del Progetto</h2>
        <Button onClick={() => setIsUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Carica Documento
        </Button>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-500 mr-2">Filtra per tag:</span>
          <Button
            variant={filterTag === null ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterTag(null)}
          >
            Tutti
          </Button>
          {allTags.slice(0, 10).map((tag) => (
            <Button
              key={tag}
              variant={filterTag === tag ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterTag(tag === filterTag ? null : tag)}
            >
              #{tag}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">Caricamento...</div>
      ) : filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {filterTag ? 'Nessun documento con questo tag' : 'Nessun documento'}
              </h3>
              <p className="text-gray-500 mb-6">
                Carica documenti di progetto per abilitare l'analisi AI e la ricerca.
              </p>
              <Button onClick={() => setIsUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Carica il primo documento
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredDocs.map((doc: any) => {
            const isExpanded = expandedDoc === doc.id;
            const category = categoryLabels[doc.ai_category] || categoryLabels.other;
            
            return (
              <Card key={doc.id} className={`transition-all ${doc.is_source_document ? 'border-purple-300 bg-purple-50/30' : ''}`}>
                <CardContent className="p-4">
                  {/* Header Row */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 p-3 bg-gray-100 rounded-lg">
                      {getFileIcon(doc.mime_type, doc.is_source_document)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900 flex items-center gap-2">
                            {doc.name}
                            {doc.is_source_document && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs">
                                Documento Sorgente
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-gray-500">{doc.file_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${category.color}`}>
                            {category.label}
                          </span>
                          {doc.ai_confidence && (
                            <span className="text-xs text-gray-400">
                              {Math.round(doc.ai_confidence * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* AI Summary */}
                      {doc.ai_summary && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                          {doc.ai_summary}
                        </p>
                      )}
                      
                      {/* Tags */}
                      {doc.ai_tags && doc.ai_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {doc.ai_tags.map((tag: string) => (
                            <span 
                              key={tag} 
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs cursor-pointer hover:bg-blue-100"
                              onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                            >
                              <Tag className="h-3 w-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Meta info */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>{formatDate(doc.created_at)}</span>
                        {doc.is_processed ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3 w-3" />
                            Elaborato
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-yellow-600">
                            <Clock className="h-3 w-3" />
                            In attesa
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                  
                  {/* Expanded Details */}
                  {isExpanded && doc.ai_metadata && Object.keys(doc.ai_metadata).length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h5 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        Metadati Estratti dall'AI
                      </h5>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        {doc.ai_metadata.language && (
                          <div>
                            <span className="text-gray-500">Lingua:</span>
                            <span className="ml-2 font-medium">{doc.ai_metadata.language.toUpperCase()}</span>
                          </div>
                        )}
                        {doc.ai_metadata.document_date && (
                          <div>
                            <span className="text-gray-500">Data documento:</span>
                            <span className="ml-2 font-medium">{doc.ai_metadata.document_date}</span>
                          </div>
                        )}
                        {doc.ai_metadata.urgency && (
                          <div>
                            <span className="text-gray-500">Urgenza:</span>
                            <span className={`ml-2 font-medium ${
                              doc.ai_metadata.urgency === 'high' ? 'text-red-600' :
                              doc.ai_metadata.urgency === 'medium' ? 'text-yellow-600' : 'text-green-600'
                            }`}>{doc.ai_metadata.urgency}</span>
                          </div>
                        )}
                        {doc.ai_metadata.action_required !== undefined && (
                          <div>
                            <span className="text-gray-500">Azione richiesta:</span>
                            <span className={`ml-2 font-medium ${doc.ai_metadata.action_required ? 'text-red-600' : 'text-green-600'}`}>
                              {doc.ai_metadata.action_required ? 'Sì' : 'No'}
                            </span>
                          </div>
                        )}
                        {doc.ai_metadata.people_mentioned?.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Persone menzionate:</span>
                            <span className="ml-2">{doc.ai_metadata.people_mentioned.join(', ')}</span>
                          </div>
                        )}
                        {doc.ai_metadata.companies_mentioned?.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Aziende menzionate:</span>
                            <span className="ml-2">{doc.ai_metadata.companies_mentioned.join(', ')}</span>
                          </div>
                        )}
                        {doc.ai_metadata.amounts_mentioned?.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Importi:</span>
                            <span className="ml-2 font-medium">{doc.ai_metadata.amounts_mentioned.join(', ')}</span>
                          </div>
                        )}
                        {doc.ai_metadata.dates_mentioned?.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Date menzionate:</span>
                            <span className="ml-2">{doc.ai_metadata.dates_mentioned.join(', ')}</span>
                          </div>
                        )}
                        {doc.ai_metadata.key_topics?.length > 0 && (
                          <div className="col-span-3">
                            <span className="text-gray-500">Argomenti chiave:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {doc.ai_metadata.key_topics.map((topic: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Carica Documento
            </DialogTitle>
            <DialogDescription>
              Carica un documento. L'AI lo classificherà automaticamente, genererà tag e un sommario.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleUpload}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>File *</Label>
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    uploadFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-purple-500'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText className="h-8 w-8 text-green-600" />
                      <div className="text-left">
                        <p className="font-medium text-green-700">{uploadFile.name}</p>
                        <p className="text-sm text-green-600">{formatFileSize(uploadFile.size)}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                      <p className="text-gray-600">Clicca per selezionare un file</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT (max 50MB)</p>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-name">Nome Documento</Label>
                <Input
                  id="doc-name"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="Nome descrittivo del documento"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-description">Descrizione (opzionale)</Label>
                <Textarea
                  id="doc-description"
                  value={docDescription}
                  onChange={(e) => setDocDescription(e.target.value)}
                  placeholder="Breve descrizione del contenuto..."
                  rows={3}
                />
              </div>
              
              <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-800">
                <p className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <strong>AI analizzerà il documento per:</strong>
                </p>
                <ul className="mt-2 ml-6 list-disc text-purple-700">
                  <li>Classificare automaticamente il tipo</li>
                  <li>Generare tag per la ricerca</li>
                  <li>Creare un sommario</li>
                  <li>Estrarre date, importi e persone</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={!uploadFile || uploadMutation.isPending}>
                {uploadMutation.isPending ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Analisi AI...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Carica e Analizza
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

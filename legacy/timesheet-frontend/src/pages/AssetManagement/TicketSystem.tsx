import React, { useState, useEffect, useCallback } from 'react';
import { 
  HelpCircle, Plus, Search,
  AlertCircle, MessageSquare, User, X, Upload,
  FileText, Download, Eye, Trash2
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { resolveAssetUrl } from '../../utils/assetUtils';
import CardSkeleton from '../../components/ui/CardSkeleton';

interface Attachment {
  id: string;
  url: string;
  filename: string;
  mimeType?: string;
  size: number;
}

interface Performer {
  firstName?: string;
  lastName?: string;
}

interface TicketHistory {
  action: string;
  remarks?: string;
  performer?: Performer;
  attachments?: Attachment[];
}

interface Ticket {
  id: string;
  ticketId?: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  createdById: string;
  assignedTo?: string;
  attachmentUrl?: string;
  attachments?: Attachment[];
  history?: TicketHistory[];
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role?: string;
  department?: string;
}

const TicketSystem: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || '';
  const isITSupport = userRole === 'admin' || userRole === 'it' || userRole.includes('it') || userRole.includes('support');

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [zoomImageName, setZoomImageName] = useState<string | null>(null);
  const [commentAttachments, setCommentAttachments] = useState<File[]>([]);
  const [commentDragging, setCommentDragging] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  
  const toast = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    assignedTo: '',
    category: 'IT Support'
  });

  const [commentData, setCommentData] = useState({
    remarks: '',
    toStatus: ''
  });

  const getFileType = (file: File) => {
    const name = file.name.toLowerCase();
    if (/\.(jpeg|jpg|gif|png|webp)$/i.test(name)) return 'image';
    if (/\.(mp4|mov|avi|webm)$/i.test(name)) return 'video';
    if (/\.(pdf|docx|xlsx)$/i.test(name)) return 'doc';
    return 'other';
  };

  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'pdf', 'docx', 'xlsx'];
    if (!ext || !allowedExts.includes(ext)) {
      return { isValid: false, error: `Unsupported file type (.${ext}). Allowed: JPG, JPEG, PNG, GIF, WEBP, MP4, MOV, AVI, WEBM, PDF, DOCX, XLSX` };
    }
    if (file.size > 50 * 1024 * 1024) {
      return { isValid: false, error: `File "${file.name}" exceeds the 50MB limit.` };
    }
    return { isValid: true };
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFilesSelected = (fileList: FileList) => {
    const validFiles: File[] = [];
    const maxFiles = 10;
    
    if (attachments.length + fileList.length > maxFiles) {
      toast.error(`You can upload a maximum of ${maxFiles} attachments.`);
      return;
    }

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast.error(validation.error || 'Invalid file');
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const handleCommentFilesSelected = (fileList: FileList) => {
    const validFiles: File[] = [];
    const maxFiles = 10;

    if (commentAttachments.length + fileList.length > maxFiles) {
      toast.error(`You can upload a maximum of ${maxFiles} attachments per comment.`);
      return;
    }

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast.error(validation.error || 'Invalid file');
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setCommentAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [tRes, eRes] = await Promise.all([
        API.get('/tickets'),
        API.get('/employees')
      ]);
      if (tRes.data.success) setTickets(tRes.data.data);
      if (eRes.data.success) setEmployees(eRes.data.data);
    } catch (error) {
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRaiseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.description) {
      toast.error('Title and Description are required');
      return;
    }
    try {
      const data = new FormData();
      data.append('title', formData.title);
      data.append('description', formData.description);
      data.append('priority', formData.priority);
      data.append('category', formData.category);
      if (formData.assignedTo) {
        data.append('assignedTo', formData.assignedTo);
      }
      attachments.forEach(file => {
        data.append('attachments', file);
      });

      const res = await API.post('/tickets', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data.success) {
        toast.success('Support ticket created successfully');
        setIsFormOpen(false);
        setFormData({ title: '', description: '', priority: 'Medium', assignedTo: '', category: 'IT Support' });
        setAttachments([]);
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to raise ticket');
    }
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentData.remarks) return;
    try {
      setCommentLoading(true);
      const data = new FormData();
      data.append('action', 'Update Status');
      data.append('toStatus', commentData.toStatus || selectedTicket.status);
      data.append('remarks', commentData.remarks);
      if (selectedTicket.assignedTo) {
        data.append('assignedTo', selectedTicket.assignedTo);
      }
      commentAttachments.forEach(file => {
        data.append('attachments', file);
      });

      const res = await API.post(`/tickets/${selectedTicket.id}/history`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data.success) {
        toast.success('Ticket updated successfully');
        setCommentData({ remarks: '', toStatus: '' });
        setCommentAttachments([]);
        
        // Reload details
        const detailsRes = await API.get(`/tickets/${selectedTicket.id}`);
        if (detailsRes.data.success) {
          setSelectedTicket(detailsRes.data.data);
        }
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to save comment');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this ticket?')) return;
    try {
      const response = await API.delete(`/tickets/${ticketId}`);
      if (response.data.success) {
        toast.success('Ticket deleted successfully');
        setSelectedTicket(null);
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to delete ticket');
    }
  };

  const handleReturnTicket = async (ticketId: string) => {
    try {
      const response = await API.patch(`/tickets/${ticketId}`, { status: 'Returned' });
      if (response.data.success) {
        toast.success('Ticket returned successfully');
        // Reload details
        const detailsRes = await API.get(`/tickets/${ticketId}`);
        if (detailsRes.data.success) {
          setSelectedTicket(detailsRes.data.data);
        }
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to return ticket');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'danger';
      case 'medium': return 'warning';
      case 'low': return 'primary';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return 'warning';
      case 'in progress': return 'primary';
      case 'resolved': return 'success';
      case 'returned': return 'danger';
      case 'closed': return 'secondary';
      default: return 'secondary';
    }
  };

  const filteredTickets = tickets.filter(t => 
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Support <span className="text-indigo-600">Tickets</span></h1>
          <p className="text-slate-500 text-sm">Raise support tickets for hardware faults, track technician resolution status, and add comment history.</p>
        </div>
        <div>
          <Button variant="primary" size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Raise Ticket
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative bg-white p-4 rounded-2xl shadow-sm">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Filter support tickets by issue summary..." 
          className="w-full pl-12 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid Split: Tickets List & Active Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left list of tickets */}
        <div className="lg:col-span-2 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {loading ? (
            <div className="space-y-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="bg-white p-8 text-center text-slate-400 rounded-3xl shadow-sm">No support tickets raised yet.</div>
          ) : filteredTickets.map((t) => (
            <div 
              key={t.id}
              onClick={() => setSelectedTicket(t)}
              className={`p-5 bg-white rounded-3xl border-2 transition-all cursor-pointer hover:scale-[1.01] hover:shadow-md flex items-center justify-between ${
                selectedTicket?.id === t.id ? 'border-indigo-500 shadow-sm' : 'border-transparent shadow-sm'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[9px] font-extrabold text-indigo-650 bg-indigo-50/70 px-2 py-0.5 rounded-md uppercase tracking-wider block w-fit mb-1">
                    {t.ticketId || `TKT-${t.id.slice(0, 6).toUpperCase()}`}
                  </span>
                  <h3 className="font-black text-slate-900 leading-snug">{t.title}</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[300px]">{t.description}</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase">Created: {format(new Date(t.createdAt), 'dd MMM yyyy')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant={getPriorityColor(t.priority)} className="rounded-lg text-[9px] font-black uppercase">{t.priority}</Badge>
                <Badge variant={getStatusColor(t.status)} className="rounded-lg text-[9px] font-black uppercase">{t.status}</Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Right Action Sidebar / Comments Log */}
        <div className="sticky top-6">
          {selectedTicket ? (
            <Card className="p-8 border-none shadow-2xl bg-white rounded-[2rem] space-y-6 max-h-[75vh] overflow-y-auto">
              <div className="border-b border-slate-100 pb-4 space-y-2">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">
                  {selectedTicket.ticketId || `TKT-${selectedTicket.id.slice(0, 6).toUpperCase()}`}
                </span>
                <div className="flex justify-between items-start gap-2">
                  <h2 className="text-lg font-black text-slate-900 leading-tight">{selectedTicket.title}</h2>
                  {(isITSupport || selectedTicket.createdById === user?.id) && (
                    <button 
                      onClick={() => handleDeleteTicket(selectedTicket.id)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all shrink-0 focus:outline-none"
                      title="Delete Ticket"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Badge variant={getPriorityColor(selectedTicket.priority)} className="text-[8px] font-black">{selectedTicket.priority}</Badge>
                  <Badge variant={getStatusColor(selectedTicket.status)} className="text-[8px] font-black">{selectedTicket.status}</Badge>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed font-medium">{selectedTicket.description}</p>

              {(isITSupport || selectedTicket.createdById === user?.id) && selectedTicket.status !== 'Returned' && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleReturnTicket(selectedTicket.id)}
                    className="w-full h-10 rounded-xl border border-rose-250 dark:border-rose-900 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold flex items-center justify-center gap-1.5"
                  >
                    Return Ticket
                  </Button>
                </div>
              )}

              {/* Multiple Attachments Gallery */}
              {((selectedTicket.attachments && selectedTicket.attachments.length > 0) || selectedTicket.attachmentUrl) && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Attachments</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedTicket.attachments && selectedTicket.attachments.length > 0 ? (
                      selectedTicket.attachments.map((att: Attachment) => {
                        const url = resolveAssetUrl(att.url) || '';
                        const name = att.filename.toLowerCase();
                        const isImg = /\.(jpeg|jpg|gif|png|webp)$/i.test(name) || att.mimeType?.startsWith('image/');
                        const isVid = /\.(mp4|webm|ogg|mov|m4v)$/i.test(name) || att.mimeType?.startsWith('video/');
                        
                        if (isImg) {
                          return (
                            <div key={att.id} className="relative group overflow-hidden rounded-2xl border border-slate-200 cursor-pointer h-32" onClick={() => { setZoomImageUrl(url); setZoomImageName(att.filename); }}>
                              <img src={url} alt={att.filename} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-350" />
                              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                                <Eye className="w-4 h-4" /> Click to Zoom
                              </div>
                            </div>
                          );
                        } else if (isVid) {
                          return (
                            <div key={att.id} className="rounded-2xl overflow-hidden border border-slate-200 bg-black h-32 flex items-center justify-center">
                              <video src={url} controls className="h-full w-full object-contain" preload="metadata" />
                            </div>
                          );
                        } else {
                          return (
                            <div key={att.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate">{att.filename}</p>
                                  <p className="text-[9px] text-slate-400 font-bold">{formatFileSize(att.size)}</p>
                                </div>
                              </div>
                              <a href={url} download={att.filename} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-150 text-slate-450 hover:text-slate-700 rounded-xl transition-colors" title="Download Attachment">
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          );
                        }
                      })
                    ) : (
                      selectedTicket.attachmentUrl && (
                        (() => {
                          const url = resolveAssetUrl(selectedTicket.attachmentUrl) || '';
                          const isImg = /\.(jpeg|jpg|gif|png|webp)$/i.test(selectedTicket.attachmentUrl);
                          const isVid = /\.(mp4|webm|ogg|mov|m4v)$/i.test(selectedTicket.attachmentUrl);
                          if (isImg) {
                            return (
                              <div className="relative group overflow-hidden rounded-2xl border border-slate-200 cursor-pointer h-32" onClick={() => { setZoomImageUrl(url); setZoomImageName('Attachment'); }}>
                                <img src={url} alt="Attachment" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-350" />
                                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                                  <Eye className="w-4 h-4" /> Click to Zoom
                                </div>
                              </div>
                            );
                          } else if (isVid) {
                            return (
                              <div className="rounded-2xl overflow-hidden border border-slate-250 bg-black h-32 flex items-center justify-center">
                                <video src={url} controls className="h-full w-full object-contain" preload="metadata" />
                              </div>
                            );
                          } else {
                            return (
                              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl col-span-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">Attachment File</p>
                                  </div>
                                </div>
                                <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-150 text-slate-455 hover:text-slate-700 rounded-xl transition-colors" title="Download Attachment">
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            );
                          }
                        })()
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Status Update & Comments */}
              <form onSubmit={handleUpdateTicket} className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <MessageSquare className="w-4 h-4 text-slate-400" /> Resolution Comments
                </h3>
                
                {/* Comments List */}
                <div className="space-y-3 max-h-[20vh] overflow-y-auto pr-1">
                  {selectedTicket.history?.map((h: TicketHistory, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                      <p className="text-[10px] text-slate-500 flex items-center gap-1.5 font-bold uppercase">
                        <User className="w-3 h-3 text-indigo-500" /> {h.performer?.firstName || 'Staff'} • {h.action}
                      </p>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{h.remarks}</p>
                      
                      {/* Comment attachments list */}
                      {h.attachments && h.attachments.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 gap-1.5">
                          {h.attachments.map((att: Attachment) => {
                            const url = resolveAssetUrl(att.url) || '';
                            const name = att.filename.toLowerCase();
                            const isImg = /\.(jpeg|jpg|gif|png|webp)$/i.test(name) || att.mimeType?.startsWith('image/');
                            const isVid = /\.(mp4|webm|ogg|mov|m4v)$/i.test(name) || att.mimeType?.startsWith('video/');
                            
                            if (isImg) {
                              return (
                                <div key={att.id} className="relative group overflow-hidden rounded-xl border border-slate-200 cursor-pointer h-16" onClick={() => { setZoomImageUrl(url); setZoomImageName(att.filename); }}>
                                  <img src={url} alt={att.filename} className="h-full w-full object-cover" />
                                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                                    Zoom
                                  </div>
                                </div>
                              );
                            } else if (isVid) {
                              return (
                                <div key={att.id} className="rounded-xl overflow-hidden border border-slate-205 bg-black h-16">
                                  <video src={url} controls className="h-full w-full object-contain" preload="metadata" />
                                </div>
                              );
                            } else {
                              return (
                                <div key={att.id} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-xl text-[10px]">
                                  <span className="truncate mr-2 font-bold text-slate-700">{att.filename}</span>
                                  <a href={url} download={att.filename} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-slate-50 text-indigo-500 rounded-lg shrink-0" title="Download Attachment">
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              );
                            }
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  {(!selectedTicket.history || selectedTicket.history.length === 0) && (
                    <p className="text-center text-[10px] text-slate-400 py-4">No comments or status updates logged yet.</p>
                  )}
                </div>

                {isITSupport && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Update Status (Optional)</label>
                      <select 
                        title="Change Status"
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
                        value={commentData.toStatus}
                        onChange={(e) => setCommentData({...commentData, toStatus: e.target.value})}
                      >
                        <option value="">Keep current status</option>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Returned">Returned</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Reassign Technician (Optional)</label>
                      <select 
                        title="Reassign Technician"
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
                        value={selectedTicket.assignedTo || ''}
                        onChange={async (e) => {
                          const newAssigneeId = e.target.value;
                          try {
                            const res = await API.patch(`/tickets/${selectedTicket.id}`, { 
                              assignedTo: newAssigneeId || null 
                            });
                            if (res.data.success) {
                              toast.success('Technician assigned successfully');
                              // Reload details
                              const detailsRes = await API.get(`/tickets/${selectedTicket.id}`);
                              if (detailsRes.data.success) {
                                setSelectedTicket(detailsRes.data.data);
                              }
                              fetchData();
                            }
                          } catch (error) {
                            toast.error('Failed to update assignment');
                          }
                        }}
                      >
                        <option value="">Unassigned</option>
                        {employees.filter(emp => {
                          const r = (emp.role || '').toLowerCase();
                          const d = (emp.department || '').toLowerCase();
                          return r === 'it' || r.includes('it') || d === 'it' || d.includes('it');
                        }).map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Comment</label>
                  <textarea 
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="Type details of investigation or repairs..."
                    value={commentData.remarks}
                    onChange={(e) => setCommentData({...commentData, remarks: e.target.value})}
                    required
                  />
                </div>

                {/* Comment File attachments drop zone */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Attach files to comment (Optional)</label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setCommentDragging(true);
                    }}
                    onDragLeave={() => {
                      setCommentDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setCommentDragging(false);
                      if (e.dataTransfer.files) {
                        handleCommentFilesSelected(e.dataTransfer.files);
                      }
                    }}
                    onClick={() => document.getElementById('comment-files-input-tech')?.click()}
                    className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer text-xs ${
                      commentDragging ? 'border-indigo-400 bg-indigo-50/10' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'
                    }`}
                  >
                    <input 
                      id="comment-files-input-tech"
                      type="file"
                      multiple
                      className="hidden"
                      accept="image/*,video/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      title="Upload Files to Comment"
                      onChange={(e) => {
                        if (e.target.files) {
                          handleCommentFilesSelected(e.target.files);
                        }
                      }}
                    />
                    <Upload className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
                    <span className="font-bold text-slate-600 block">Click or drag files</span>
                  </div>

                  {commentAttachments.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5 mt-2">
                      {commentAttachments.map((file, idx) => {
                        const isImg = getFileType(file) === 'image';
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-xl">
                            <div className="flex items-center gap-2 min-w-0">
                              {isImg ? (
                                <img src={URL.createObjectURL(file)} alt="Thumbnail" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                              ) : (
                                <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold text-slate-800 truncate">{file.name}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  setCommentAttachments(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="p-1 text-rose-500 hover:bg-slate-200 rounded-lg shrink-0 transition-colors"
                              title="Remove Attachment"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Button variant="primary" fullWidth type="submit" isLoading={commentLoading}>Submit Comment</Button>
              </form>
            </Card>
          ) : (
            <Card className="p-8 border-dashed border-2 border-slate-200 rounded-[2rem] text-center py-20 flex flex-col items-center justify-center gap-4 text-slate-400 bg-white">
              <HelpCircle className="w-12 h-12 text-slate-300" />
              <div>
                <p className="text-sm font-bold text-slate-900">Select Support Ticket</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">Click any ticket on the left to see descriptions and view updates comments timeline.</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Raise Ticket Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Raise Support <span className="text-indigo-600">Ticket</span></h2>
                <p className="text-slate-500 text-xs mt-1">Explain hardware defects, software lockouts, or network failures.</p>
              </div>
              <button title="Close" onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleRaiseTicket} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Issue Title</label>
                <input type="text" placeholder="e.g. Dell Laptop charger not functioning" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required />
              </div>

              {/* Ticket Category Dropdown */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-450 uppercase tracking-widest block">Ticket Category</label>
                <select
                  title="Category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                >
                  <option value="IT Support">IT Support</option>
                  <option value="Hardware Issues">Hardware Issues</option>
                  <option value="Software Lockouts">Software Lockouts</option>
                  <option value="Network/Internet">Network/Internet</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Issue Priority</label>
                  <select 
                    title="Priority"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value})}
                  >
                    <option value="Low">Low (General question)</option>
                    <option value="Medium">Medium (Minor defect)</option>
                    <option value="High">High (Work blocker)</option>
                  </select>
                </div>

                {isITSupport && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Assign to Technician (Optional)</label>
                    <select 
                      title="Assignee"
                      className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                      value={formData.assignedTo}
                      onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
                    >
                      <option value="">Unassigned</option>
                      {employees.filter(emp => {
                        const r = (emp.role || '').toLowerCase();
                        const d = (emp.department || '').toLowerCase();
                        return r === 'it' || r.includes('it') || d === 'it' || d.includes('it');
                      }).map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Description of Issue</label>
                <textarea 
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Explain device problems or fault diagnostics here..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  required
                />
              </div>

              {/* File Attachment Upload Box with Drag and Drop */}
              <div className="space-y-2.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Confirmation Photos, Videos or Documents (Optional)
                </label>
                <div 
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => {
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) {
                      handleFilesSelected(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => document.getElementById('ticket-system-attachment')?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                    isDragging || attachments.length > 0
                      ? 'border-indigo-400 bg-indigo-50/10' 
                      : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'
                  }`}
                >
                  <input 
                    id="ticket-system-attachment"
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,video/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    title="Upload Confirmation Attachments"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesSelected(e.target.files);
                      }
                    }}
                  />
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mb-1">
                    <Upload className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">Choose files or drag here</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Supports Images, Videos, PDF, DOCX, XLSX (Max 10 files)</p>
                  </div>
                </div>

                {/* Previews of attachments before submitting */}
                {attachments.length > 0 && (
                  <div className="grid grid-cols-1 gap-1.5 mt-2">
                    {attachments.map((file, idx) => {
                      const isImg = getFileType(file) === 'image';
                      const isVid = getFileType(file) === 'video';
                      
                      return (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2 min-w-0">
                            {isImg ? (
                              <img src={URL.createObjectURL(file)} alt="Preview" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                            ) : isVid ? (
                              <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center shrink-0 overflow-hidden">
                                <video src={URL.createObjectURL(file)} muted className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold text-slate-800 truncate">{file.name}</p>
                              <p className="text-[8px] text-slate-400 font-bold">{formatFileSize(file.size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAttachments(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1 text-rose-500 hover:bg-slate-200 rounded-lg shrink-0 transition-colors"
                            title="Remove Attachment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Submit Ticket</Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 6. IMAGE ZOOM PREVIEW MODAL */}
      {zoomImageUrl && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="relative max-h-[90vh] max-w-[95vw] flex flex-col items-center justify-center z-10 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => { setZoomImageUrl(null); setZoomImageName(null); }}
              className="absolute -top-12 right-0 p-2.5 bg-slate-900/60 hover:bg-slate-800 text-white rounded-full transition-all focus:outline-none"
              title="Close Zoom View"
            >
              <X className="w-5 h-5" />
            </button>
            <img 
              src={zoomImageUrl} 
              alt={zoomImageName || 'Preview'} 
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl border border-slate-850"
            />
            {zoomImageName && (
              <p className="text-white text-xs font-bold mt-4 bg-slate-900/50 px-4.5 py-2 rounded-full border border-slate-800">
                {zoomImageName}
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default TicketSystem;

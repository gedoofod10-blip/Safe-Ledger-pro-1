import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StickyNote, Send, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ClientNotesSheetProps {
  open: boolean;
  onClose: () => void;
  notes: string[];
  onAddNote: (note: string) => void;
  onDeleteNote: (index: number) => void;
}

const ClientNotesSheet = ({ open, onClose, notes, onAddNote, onDeleteNote }: ClientNotesSheetProps) => {
  const [newNote, setNewNote] = useState('');

  if (!open) return null;

  const handleAdd = () => {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setNewNote('');
    toast.success('تمت إضافة الملاحظة ✓');
  };

  const handleDelete = (index: number) => {
    onDeleteNote(index);
    toast.success('تم حذف الملاحظة');
  };

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in" onClick={onClose}>
      <Card className="w-full max-w-lg rounded-b-none rounded-t-2xl border-0 shadow-2xl animate-slide-up max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">ملاحظات العميل</h2>
              <StickyNote className="w-5 h-5 text-primary" />
            </div>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5" dir="rtl">
            {notes.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 animate-fade-in">
                <StickyNote className="w-12 h-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">لا توجد ملاحظات بعد</p>
              </div>
            ) : (
              notes.map((note, i) => (
                <div key={i} className="flex gap-3 items-start bg-muted/40 rounded-xl p-3 animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground leading-relaxed flex-1">{note}</p>
                  <button
                    onClick={() => handleDelete(i)}
                    className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors flex-shrink-0"
                    title="حذف الملاحظة"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border flex items-center gap-2" dir="rtl">
            <input
              className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-right text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="أضف ملاحظة جديدة..."
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!newNote.trim()}
              className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientNotesSheet;

'use client';

import type React from 'react';

import { useToast } from '@/hooks/use-toast';
import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Paperclip,
  ArrowUp,
  Loader2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Mic,
  Trash2,
} from 'lucide-react';
import { ExamplePrompts } from '@/components/example-prompts';
import { ChatMessage } from '@/components/chat-message';
import { FilePreview } from '@/components/file-preview';
import { client } from '@/lib/langgraph-client';
import { PDFDocument, RetrieveDocumentsNodeUpdates } from '@/types/graphTypes';
import { Card, CardContent } from '@/components/ui/card';

export default function Home() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<
    Array<{
      role: 'user' | 'assistant';
      content: string;
      sources?: PDFDocument[];
    }>
  >([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [jobDescription, setJobDescription] = useState<string>('');
  const [isJdOpen, setIsJdOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastRetrievedDocsRef = useRef<PDFDocument[]>([]);

  // Initialize sessionId per browser session
  useEffect(() => {
    let sid =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('cv_session_id')
        : null;
    if (!sid) {
      sid =
        'sess_' +
        Math.random().toString(36).substring(2, 10) +
        '_' +
        Date.now();
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('cv_session_id', sid);
      }
    }
    setSessionId(sid);
  }, []);

  // Initialize LangGraph thread
  useEffect(() => {
    const initThread = async () => {
      if (threadId) return;

      try {
        const thread = await client.createThread();
        setThreadId(thread.thread_id);
      } catch (error) {
        console.error('Error creating thread:', error);
        toast({
          title: 'Lỗi khởi tạo',
          description:
            'Không thể kết nối với LangGraph server. Vui lòng kiểm tra backend đang chạy.',
          variant: 'destructive',
        });
      }
    };
    initThread();
  }, [threadId, toast]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Unified message sender
  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || !threadId || isLoading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage = messageText.trim();
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, sources: undefined },
      { role: 'assistant', content: '', sources: undefined },
    ]);
    setInput('');
    setIsLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    lastRetrievedDocsRef.current = [];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          threadId,
          sessionId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = decoder.decode(value);
        const lines = chunkStr.split('\n').filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const sseString = line.slice('data: '.length);
          let sseEvent: any;
          try {
            sseEvent = JSON.parse(sseString);
          } catch (err) {
            console.error('Error parsing SSE line:', err, line);
            continue;
          }

          const { event, data } = sseEvent;

          if (event === 'messages/partial') {
            if (Array.isArray(data)) {
              const lastObj = data[data.length - 1];
              if (lastObj?.type === 'ai') {
                const partialContent = lastObj.content ?? '';

                if (
                  typeof partialContent === 'string' &&
                  !partialContent.startsWith('{')
                ) {
                  setMessages((prev) => {
                    const newArr = [...prev];
                    if (
                      newArr.length > 0 &&
                      newArr[newArr.length - 1].role === 'assistant'
                    ) {
                      newArr[newArr.length - 1].content = partialContent;
                      newArr[newArr.length - 1].sources =
                        lastRetrievedDocsRef.current;
                    }
                    return newArr;
                  });
                }
              }
            }
          } else if (event === 'updates' && data) {
            if (
              data &&
              typeof data === 'object' &&
              'retrieveDocuments' in data &&
              data.retrieveDocuments &&
              Array.isArray(data.retrieveDocuments.documents)
            ) {
              const retrievedDocs = (data as RetrieveDocumentsNodeUpdates)
                .retrieveDocuments.documents as PDFDocument[];
              lastRetrievedDocsRef.current = retrievedDocs;
            } else {
              lastRetrievedDocsRef.current = [];
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Lỗi gửi tin nhắn',
        description:
          'Không thể xử lý yêu cầu. Vui lòng thử lại.\n' +
          (error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
      setMessages((prev) => {
        const newArr = [...prev];
        if (newArr.length > 0 && newArr[newArr.length - 1].role === 'assistant') {
          newArr[newArr.length - 1].content =
            'Xin lỗi, đã có lỗi xảy ra trong quá trình xử lý phản hồi.';
        }
        return newArr;
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Quick Action: Match CV against JD
  const handleMatchResume = () => {
    if (files.length === 0) {
      toast({
        title: 'Chưa tải CV lên',
        description:
          'Vui lòng bấm icon kẹp giấy 📎 bên dưới để tải file PDF CV của bạn trước.',
        variant: 'destructive',
      });
      return;
    }

    if (!jobDescription.trim()) {
      setIsJdOpen(true);
      toast({
        title: 'Chưa có Job Description (JD)',
        description:
          'Vui lòng dán nội dung JD vào ô bên trên để AI đối chiếu chấm điểm.',
        variant: 'destructive',
      });
      return;
    }

    const prompt = `Hãy đóng vai Senior Technical Recruiter, đối chiếu toàn bộ nội dung CV của tôi với Job Description (JD) dưới đây để đánh giá:\n\n[JOB DESCRIPTION]:\n${jobDescription.trim()}\n\nHãy xuất báo cáo chi tiết gồm:\n1. Điểm phù hợp (% ước tính) & Tóm tắt nhận xét\n2. Kỹ năng & Kinh nghiệm CV đã đáp ứng tốt\n3. Lỗ hổng & Kỹ năng/Từ khóa còn thiếu\n4. Gợi ý viết lại 2-3 gạch đầu dòng trong CV bằng tiếng Anh chuyên nghiệp (Action Verb + Metrics).`;
    sendMessage(prompt);
  };

  // Quick Action: Start Mock Interview
  const handleStartMockInterview = () => {
    if (files.length === 0) {
      toast({
        title: 'Chưa tải CV lên',
        description:
          'Vui lòng bấm icon kẹp giấy 📎 bên dưới để tải file PDF CV của bạn trước.',
        variant: 'destructive',
      });
      return;
    }

    let prompt = '';
    if (jobDescription.trim()) {
      prompt = `Tôi muốn bắt đầu buổi phỏng vấn kỹ thuật thử (Mock Interview) cho vị trí theo Job Description (JD) sau:\n\n[JOB DESCRIPTION]:\n${jobDescription.trim()}\n\nHãy đóng vai Senior Technical Lead / Hiring Manager, đọc kỹ các dự án và công nghệ trong CV của tôi để bắt đầu buổi phỏng vấn. Hãy chào hỏi ngắn gọn và đặt DUY NHẤT 1 câu hỏi kỹ thuật chuyên sâu đầu tiên xoáy vào dự án tôi đã làm.`;
    } else {
      prompt = `Tôi muốn bắt đầu buổi phỏng vấn kỹ thuật thử (Mock Interview). Hãy đóng vai Senior Technical Lead, đọc các dự án và công nghệ trong CV của tôi và bắt đầu buổi phỏng vấn bằng DUY NHẤT 1 câu hỏi kỹ thuật chuyên sâu đầu tiên về dự án thực tế tôi đã thực hiện.`;
    }
    sendMessage(prompt);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const nonPdfFiles = selectedFiles.filter(
      (file) => file.type !== 'application/pdf',
    );
    if (nonPdfFiles.length > 0) {
      toast({
        title: 'Định dạng file không hỗ trợ',
        description: 'Vui lòng chỉ tải lên file định dạng PDF',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });
      if (sessionId) {
        formData.append('sessionId', sessionId);
      }

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload files');
      }

      setFiles((prev) => [...prev, ...selectedFiles]);
      toast({
        title: 'Tải CV thành công',
        description: `Đã nạp ${selectedFiles.length} file PDF vào phiên làm việc hiện tại.`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: 'Tải file thất bại',
        description:
          'Không thể xử lý file PDF. Vui lòng thử lại.\n' +
          (error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (fileToRemove: File) => {
    setFiles(files.filter((file) => file !== fileToRemove));
    toast({
      title: 'Đã xóa file',
      description: `${fileToRemove.name} đã được gỡ khỏi danh sách.`,
      variant: 'default',
    });
  };

  const jdWordCount = jobDescription.trim()
    ? jobDescription.trim().split(/\s+/).length
    : 0;

  return (
    <main className="flex min-h-screen flex-col items-center p-3 md:p-8 max-w-5xl mx-auto w-full">
      {/* Top Header / Branding */}
      <header className="w-full flex items-center justify-between pb-4 mb-4 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <div>
            <h1 className="text-base font-bold tracking-tight">
              AI Resume Matcher & Interview Coach
            </h1>
            <p className="text-xs text-muted-foreground">
              Powered by Google Gemini 3.8 Flash & LangGraph
            </p>
          </div>
        </div>

        {/* Session Badge */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[11px] truncate max-w-[120px]">
            {sessionId || 'Đang kết nối...'}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-6 my-auto text-center py-6">
          <div className="space-y-3 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Trợ lý Kỹ thuật Cá nhân
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Sẵn sàng cho kỳ phỏng vấn tiếp theo
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tải lên CV của bạn, dán bản mô tả công việc (JD), nhận đánh giá độ tương thích chi tiết và luyện tập phỏng vấn thử cùng Senior Tech Lead.
            </p>
          </div>

          <ExamplePrompts onPromptSelect={(prompt) => sendMessage(prompt)} />
        </div>
      ) : (
        <div className="w-full space-y-4 mb-44">
          {messages.map((message, i) => (
            <ChatMessage key={i} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Floating Bottom Panel: JD Drawer + Actions + Chat Input */}
      <div className="fixed bottom-0 left-0 right-0 p-3 md:p-4 bg-background/95 backdrop-blur border-t z-50">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Collapsible Job Description Box */}
          {isJdOpen && (
            <Card className="border shadow-md bg-card">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Briefcase className="w-3.5 h-3.5 text-primary" />
                    Bản mô tả công việc (Job Description - JD)
                    <span className="text-muted-foreground font-normal">
                      ({jdWordCount} từ)
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {jobDescription.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => setJobDescription('')}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Xóa
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setIsJdOpen(false)}
                    >
                      Đóng
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Dán nội dung Job Description (JD) từ công ty bạn muốn ứng tuyển vào đây (yêu cầu kỹ năng, công nghệ, trách nhiệm công việc)..."
                  rows={4}
                  className="text-xs resize-none focus-visible:ring-1"
                />
              </CardContent>
            </Card>
          )}

          {/* Uploaded Files Preview */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {files.map((file, index) => (
                <FilePreview
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={() => handleRemoveFile(file)}
                />
              ))}
            </div>
          )}

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-medium border-primary/30 hover:bg-primary/10 hover:text-primary transition-all flex items-center gap-1.5 shadow-sm h-8"
              onClick={handleMatchResume}
              disabled={isLoading || isUploading}
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Chấm điểm CV với JD
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-medium border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all flex items-center gap-1.5 shadow-sm h-8"
              onClick={handleStartMockInterview}
              disabled={isLoading || isUploading}
            >
              <Mic className="w-3.5 h-3.5 text-emerald-500" />
              Phỏng vấn Kỹ thuật Thử
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-xs font-normal text-muted-foreground ml-auto flex items-center gap-1 h-8"
              onClick={() => setIsJdOpen((prev) => !prev)}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>
                {jobDescription.trim() ? `JD (${jdWordCount} từ)` : 'Dán JD'}
              </span>
              {isJdOpen ? (
                <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
              )}
            </Button>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex gap-2 border rounded-xl overflow-hidden bg-muted/40 focus-within:ring-1 focus-within:ring-primary shadow-sm">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf"
                multiple
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none h-11 w-11 hover:bg-muted"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Tải lên file PDF CV"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isUploading
                    ? 'Đang nạp CV...'
                    : files.length === 0
                      ? 'Tải lên CV (kẹp giấy 📎) hoặc gõ tin nhắn...'
                      : 'Nhập câu hỏi hoặc câu trả lời phỏng vấn...'
                }
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-11 bg-transparent text-sm"
                disabled={isUploading || isLoading || !threadId}
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-none h-11 w-11"
                disabled={
                  !input.trim() || isUploading || isLoading || !threadId
                }
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

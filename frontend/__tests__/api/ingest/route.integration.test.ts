import { POST } from '@/app/api/ingest/route';
import { NextRequest } from 'next/server';
import { processPDF } from '@/lib/pdf';
import { langGraphServerClient } from '@/lib/langgraph-server';

// Mock processPDF
jest.mock('@/lib/pdf', () => ({
  processPDF: jest.fn().mockImplementation((file: File, sessionId?: string) => {
    return Promise.resolve([
      {
        pageContent: 'Test resume content',
        metadata: { filename: file.name, ...(sessionId ? { sessionId } : {}) },
      },
    ]);
  }),
}));

// Mock langGraphServerClient
jest.mock('@/lib/langgraph-server', () => {
  return {
    langGraphServerClient: {
      createThread: jest
        .fn()
        .mockResolvedValue({ thread_id: 'test-thread-id-123' }),
      client: {
        runs: {
          wait: jest.fn().mockResolvedValue({ status: 'success' }),
          stream: jest.fn().mockImplementation(async function* () {
            yield { data: 'test' };
          }),
        },
      },
    },
  };
});

describe('POST /api/ingest Route Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject empty requests with status 400', async () => {
    const formData = new FormData();
    const req = {
      formData: async () => formData,
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('No files provided');
  });

  it('should reject non-PDF files with status 400', async () => {
    const formData = new FormData();
    const txtFile = new File(['plain text'], 'document.txt', {
      type: 'text/plain',
    });
    formData.append('files', txtFile);

    const req = {
      formData: async () => formData,
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Only PDF files are allowed');
  });

  it('should reject requests with more than 5 files with status 400', async () => {
    const formData = new FormData();
    for (let i = 0; i < 6; i++) {
      formData.append(
        'files',
        new File([`pdf-dummy-${i}`], `file_${i}.pdf`, {
          type: 'application/pdf',
        }),
      );
    }

    const req = {
      formData: async () => formData,
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Too many files. Maximum 5 files allowed.');
  });

  it('should successfully ingest PDF files and return threadId', async () => {
    const formData = new FormData();
    const pdfFile = new File(['%PDF-1.7 dummy content'], 'cv.pdf', {
      type: 'application/pdf',
    });
    formData.append('files', pdfFile);
    formData.append('sessionId', 'test-session-uuid');

    const req = {
      formData: async () => formData,
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe('Documents ingested successfully');
    expect(data.threadId).toBe('test-thread-id-123');

    // Verify processPDF was called with the file and sessionId
    expect(processPDF).toHaveBeenCalledWith(pdfFile, 'test-session-uuid');
    // Verify LangGraph thread and wait was called
    expect(langGraphServerClient.createThread).toHaveBeenCalled();
    expect(langGraphServerClient.client.runs.wait).toHaveBeenCalledWith(
      'test-thread-id-123',
      'ingestion_graph',
      expect.objectContaining({
        input: expect.objectContaining({
          docs: expect.any(Array),
        }),
      }),
    );
  });
});

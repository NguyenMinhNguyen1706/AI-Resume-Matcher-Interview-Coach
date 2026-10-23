import { POST } from '@/app/api/chat/route';

// Mock langgraph-server
const mockStream = jest.fn();
jest.mock('@/lib/langgraph-server', () => ({
  createServerClient: () => ({
    client: {
      runs: {
        stream: mockStream,
      },
    },
  }),
}));

describe('POST /api/chat Route Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 if message is missing', async () => {
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'test-thread' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Message is required');
  });

  it('should return 400 if threadId is missing', async () => {
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello AI' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Thread ID is required');
  });

  it('should initiate stream and pass sessionId in configurable filterKwargs', async () => {
    // Mock an async generator stream
    mockStream.mockImplementation(async function* () {
      yield {
        event: 'messages/metadata',
        data: [{ content: 'Phân tích CV...', type: 'ai' }],
      };
    });

    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Chấm điểm CV giúp tôi',
        threadId: 'thread-xyz-789',
        sessionId: 'session-candidate-456',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');

    expect(mockStream).toHaveBeenCalledWith(
      'thread-xyz-789',
      'retrieval_graph',
      expect.objectContaining({
        input: { query: 'Chấm điểm CV giúp tôi' },
        config: expect.objectContaining({
          configurable: expect.objectContaining({
            filterKwargs: { sessionId: 'session-candidate-456' },
          }),
        }),
      }),
    );
  });
});

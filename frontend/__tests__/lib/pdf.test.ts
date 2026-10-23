import { processPDF } from '@/lib/pdf';
import { Document } from '@langchain/core/documents';

// Mock @langchain/community/document_loaders/fs/pdf
jest.mock('@langchain/community/document_loaders/fs/pdf', () => {
  return {
    PDFLoader: jest.fn().mockImplementation(() => ({
      load: jest.fn().mockResolvedValue([
        new Document({
          pageContent: 'Resume of Nguyen Van A. Senior Fullstack Developer.',
          metadata: { page: 1 },
        }),
        new Document({
          pageContent: 'Experience with React, Next.js, TypeScript, Node.js.',
          metadata: { page: 2 },
        }),
      ]),
    })),
  };
});

describe('processPDF unit tests', () => {
  it('should parse PDF and attach filename to chunk metadata', async () => {
    const file = {
      name: 'resume.pdf',
      arrayBuffer: async () => Buffer.from('dummy-content').buffer,
    } as unknown as File;

    const docs = await processPDF(file);

    expect(docs).toHaveLength(2);
    expect(docs[0].metadata.filename).toBe('resume.pdf');
    expect(docs[1].metadata.filename).toBe('resume.pdf');
    expect(docs[0].metadata.sessionId).toBeUndefined();
  });

  it('should isolate session by attaching sessionId to chunk metadata when provided', async () => {
    const file = {
      name: 'my_cv.pdf',
      arrayBuffer: async () => Buffer.from('dummy-content').buffer,
    } as unknown as File;
    const testSessionId = 'session-uuid-1234-5678';

    const docs = await processPDF(file, testSessionId);

    expect(docs).toHaveLength(2);
    expect(docs[0].metadata.filename).toBe('my_cv.pdf');
    expect(docs[0].metadata.sessionId).toBe(testSessionId);
    expect(docs[1].metadata.sessionId).toBe(testSessionId);
  });
});

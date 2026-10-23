import { startServer } from '@langchain/langgraph-cli/dist/server.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const port = Number(process.env.PORT) || 2024;
const host = '127.0.0.1';

const { host: serverHost } = await startServer({
  port,
  nWorkers: 4,
  host,
  cwd: __dirname,
  graphs: {
    ingestion_graph: './src/ingestion_graph/graph.ts:graph',
    retrieval_graph: './src/retrieval_graph/graph.ts:graph',
  },
});

console.log(`🚀 LangGraph server running at http://localhost:${port}`);

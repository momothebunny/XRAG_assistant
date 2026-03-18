import { Database, Server, Activity, TrendingUp, Globe, HardDrive } from 'lucide-react';

export const SafeDatabase = Database || Server;
export const SafeActivity = Activity || TrendingUp;

export const VECTOR_PROVIDERS = [
  { id: 'pinecone', name: 'Pinecone', type: 'Managed Cloud', icon: Globe, color: 'text-emerald-500' },
  { id: 'weaviate', name: 'Weaviate', type: 'Hybrid / Cloud', icon: Globe, color: 'text-indigo-500' },
  { id: 'milvus', name: 'Milvus', type: 'Enterprise / On-prem', icon: Server, color: 'text-blue-600' },
  { id: 'chroma', name: 'ChromaDB', type: 'Open Source / Local', icon: HardDrive, color: 'text-amber-500' },
  { id: 'pgvector', name: 'pgvector (Postgres)', type: 'Relational DB', icon: SafeDatabase, color: 'text-slate-600' },
];

export const INITIAL_DOCS = [
  { id: 5, name: 'BCP_Plan_2023.pdf', size: '2.1 MB', type: 'PDF', status: 'Indexed', date: '2023.11.19.', chunks: 118 },
  { id: 1, name: 'BCP_Plan_2024.pdf', size: '2.4 MB', type: 'PDF', status: 'Indexed', date: '2024.01.12.', chunks: 142 },
  { id: 2, name: 'Infra_Security_v2.docx', size: '1.1 MB', type: 'DOCX', status: 'Indexed', date: '2024.02.05.', chunks: 89 },
  { id: 3, name: 'Training_Log.csv', size: '840 KB', type: 'CSV', status: 'Processing', date: '2024.02.28.', chunks: 0 },
  { id: 4, name: 'Policy_Manual_Final.pdf', size: '4.7 MB', type: 'PDF', status: 'Error', date: '2024.02.15.', chunks: 0 },
];

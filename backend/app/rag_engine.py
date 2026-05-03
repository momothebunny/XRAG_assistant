import os
from pathlib import Path
from time import perf_counter

from .models import AssistantSettings, ChatResponse, ChatRequest, SourceSnippet


class LangChainRAGEngine:
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._knowledge_dir = data_dir / "knowledge"
        self._knowledge_dir.mkdir(parents=True, exist_ok=True)

    def _ensure_seed_document(self) -> None:
        seed_path = self._knowledge_dir / "xrag_bootstrap.md"
        if seed_path.exists():
            return

        seed_path.write_text(
            "# XRAG Bootstrap Context\n"
            "BCP 2024 requires security audit closure before critical cutover.\n"
            "Operational changes on high impact systems require dual control confirmation.\n"
            "Strict mode means answers must stay within provided indexed context.\n",
            encoding="utf-8",
        )

    def _load_documents(self):
        from langchain_core.documents import Document

        self._ensure_seed_document()
        docs = []

        for path in self._knowledge_dir.rglob("*"):
            if not path.is_file():
                continue

            if path.suffix.lower() not in {".txt", ".md", ".log"}:
                continue

            text = path.read_text(encoding="utf-8", errors="ignore").strip()
            if not text:
                continue

            docs.append(
                Document(
                    page_content=text,
                    metadata={
                        "source": path.name,
                        "path": str(path),
                    },
                )
            )

        return docs

    def _retrieve(self, question: str, settings: AssistantSettings):
        from langchain_community.retrievers import BM25Retriever
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        docs = self._load_documents()
        if not docs:
            return []

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.retrieval.chunk_size,
            chunk_overlap=settings.retrieval.chunk_overlap,
        )
        chunks = splitter.split_documents(docs)
        if not chunks:
            return []

        retriever = BM25Retriever.from_documents(chunks)
        retriever.k = settings.retrieval.top_k
        return retriever.invoke(question)

    def _build_context(self, docs) -> tuple[str, list[SourceSnippet]]:
        context_parts = []
        sources = []

        for index, doc in enumerate(docs, start=1):
            source_label = doc.metadata.get("source", f"source_{index}.txt")
            text = doc.page_content.strip()
            token_count = max(1, len(text.split()))

            context_parts.append(f"[{index}] {source_label}: {text}")
            sources.append(
                SourceSnippet(
                    label=source_label,
                    page=1,
                    chunkId=f"C-{index:03d}",
                    tokenCount=token_count,
                    snippet=text[:280],
                )
            )

        return "\n\n".join(context_parts), sources

    def _resolve_provider(self, settings: AssistantSettings) -> str:
        configured = (settings.llm.provider or "").strip().lower()
        if configured and configured != "auto":
            return configured

        model = (settings.llm.model or "").lower()
        if "gemini" in model:
            return "gemini"
        if "claude" in model:
            return "anthropic"

        return "openai"

    def _resolve_model_name(self, provider: str, configured_model: str) -> str:
        model = (configured_model or "").strip()
        model_lower = model.lower()

        if provider == "gemini":
            if model_lower in {"gemini 2.5 flash", "gemini-2.5-flash"}:
                return "gemini-2.5-flash"
            if model_lower in {"gemini 1.5 pro", "gemini-1.5-pro"}:
                return "gemini-1.5-pro-latest"
            if model_lower in {"gemini 1.5 flash", "gemini-1.5-flash"}:
                return "gemini-1.5-flash-latest"
            if model_lower in {"gemini 2.0 flash", "gemini-2.0-flash"}:
                return "gemini-2.0-flash"
            if model_lower.startswith("gemini"):
                return model_lower.replace(" ", "-")
            return "gemini-1.5-pro-latest"

        if provider == "openai":
            if model_lower == "gpt-4o":
                return "gpt-4o"
            return model or "gpt-4o"

        return model

    def _resolve_api_key(self, provider: str, settings: AssistantSettings) -> str | None:
        preferred_env = (settings.llm.api_key_env or "").strip()
        env_candidates = []
        if preferred_env:
            env_candidates.append(preferred_env)

        if provider == "gemini":
            env_candidates.extend(["GOOGLE_API_KEY", "GEMINI_API_KEY"])
        elif provider == "openai":
            env_candidates.append("OPENAI_API_KEY")

        for env_name in env_candidates:
            value = os.getenv(env_name)
            if value:
                return value

        return None

    def _generate_answer(self, question: str, context: str, settings: AssistantSettings) -> str:
        provider = self._resolve_provider(settings)
        model_name = self._resolve_model_name(provider, settings.llm.model)
        api_key = self._resolve_api_key(provider, settings)
        if not api_key:
            return self._fallback_answer(question, context, settings, "missing_api_key")

        try:
            from langchain_core.output_parsers import StrOutputParser
            from langchain_core.prompts import ChatPromptTemplate

            if provider == "gemini":
                from langchain_google_genai import ChatGoogleGenerativeAI

                llm = ChatGoogleGenerativeAI(
                    model=model_name,
                    temperature=settings.llm.temperature,
                    google_api_key=api_key,
                )
            elif provider == "openai":
                from langchain_openai import ChatOpenAI

                llm = ChatOpenAI(
                    model=model_name,
                    temperature=settings.llm.temperature,
                    api_key=api_key,
                    base_url=settings.llm.base_url,
                )
            else:
                return self._fallback_answer(question, context, settings, f"unsupported_provider:{provider}")

            strict_instruction = (
                "You must answer only from context. If context is insufficient, explicitly state insufficiency."
                if settings.llm.strict_mode
                else "You may provide cautious extrapolation beyond context when clearly marked as assumption."
            )

            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        f"{settings.llm.system_prompt}\n{strict_instruction}",
                    ),
                    (
                        "human",
                        "Question:\n{question}\n\nContext:\n{context}\n\nAnswer with short grounded explanation.",
                    ),
                ]
            )

            chain = prompt | llm | StrOutputParser()
            return chain.invoke({"question": question, "context": context}).strip()
        except Exception as exc:
            short = f"{exc.__class__.__name__}:{str(exc)[:180]}"
            return self._fallback_answer(question, context, settings, short)

    def _fallback_answer(self, question: str, context: str, settings: AssistantSettings, reason: str | None = None) -> str:
        provider = self._resolve_provider(settings)
        context_line = context.splitlines()[0] if context else "No indexed context available."
        strict_line = "strict=ON" if settings.llm.strict_mode else "strict=OFF"
        reason_line = f" reason={reason}." if reason else ""
        return (
            f"RAG fallback answer ({provider}/{settings.llm.model}, {strict_line}). "
            f"Question: {question}. "
            f"Top retrieved context: {context_line}.{reason_line}"
        )

    def run(self, payload: ChatRequest, settings: AssistantSettings) -> ChatResponse:
        t0 = perf_counter()
        docs = self._retrieve(payload.message, settings)
        t1 = perf_counter()

        context, sources = self._build_context(docs)
        answer = self._generate_answer(payload.message, context, settings)
        t2 = perf_counter()

        reasoning = (
            "1. Loaded XRAG settings from backend storage. "
            f"2. LangChain BM25 retrieval returned {len(sources)} chunks. "
            "3. Built grounded context window and generated final response. "
            f"Runtime config: model={settings.llm.model}, temp={settings.llm.temperature:.1f}, top_k={settings.retrieval.top_k}."
        )

        if payload.prompt_reference:
            reasoning += f" Prompt reference: {payload.prompt_reference}."

        return ChatResponse(
            content=answer,
            reasoning=reasoning,
            traceSteps=[
                {"label": "Retrieve", "duration": f"{int((t1 - t0) * 1000)} ms"},
                {"label": "Generate", "duration": f"{int((t2 - t1) * 1000)} ms"},
                {"label": "Total", "duration": f"{int((t2 - t0) * 1000)} ms"},
            ],
            sources=sources,
        )

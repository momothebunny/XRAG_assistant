import json
from pathlib import Path
from threading import Lock
from time import time
from uuid import uuid4

from .models import AssistantSettings, SaveAnswerRequest, SavedAnswer


class JsonStore:
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._settings_path = data_dir / "settings.json"
        self._answers_path = data_dir / "saved_answers.json"
        self._lock = Lock()
        self._data_dir.mkdir(parents=True, exist_ok=True)

    def _read_json_file(self, path: Path, fallback):
        if not path.exists():
            return fallback

        return json.loads(path.read_text(encoding="utf-8"))

    def get_settings(self) -> AssistantSettings:
        with self._lock:
            payload = self._read_json_file(self._settings_path, None)
            if payload is None:
                return AssistantSettings()

            return AssistantSettings.model_validate(payload)

    def save_settings(self, settings: AssistantSettings) -> AssistantSettings:
        with self._lock:
            self._settings_path.write_text(
                settings.model_dump_json(indent=2),
                encoding="utf-8",
            )
            return settings

    def list_answers(self) -> list[SavedAnswer]:
        with self._lock:
            payload = self._read_json_file(self._answers_path, [])
            return [SavedAnswer.model_validate(item) for item in payload]

    def save_answer(self, request: SaveAnswerRequest) -> tuple[bool, SavedAnswer]:
        with self._lock:
            payload = self._read_json_file(self._answers_path, [])
            answers = [SavedAnswer.model_validate(item) for item in payload]
            normalized_content = request.content.strip()

            for answer in answers:
                if answer.content.strip() == normalized_content:
                    return False, answer

            item = SavedAnswer(
                id=f"answer-{uuid4().hex[:10]}",
                content=normalized_content,
                reasoning=request.reasoning,
                sources=request.sources,
                promptReference=request.promptReference,
                createdAt=int(time() * 1000),
            )
            answers.insert(0, item)

            self._answers_path.write_text(
                json.dumps([answer.model_dump() for answer in answers[:100]], indent=2),
                encoding="utf-8",
            )
            return True, item

    def delete_answer(self, answer_id: str) -> bool:
        with self._lock:
            payload = self._read_json_file(self._answers_path, [])
            answers = [SavedAnswer.model_validate(item) for item in payload]
            before = len(answers)
            answers = [a for a in answers if a.id != answer_id]
            if len(answers) == before:
                return False
            self._answers_path.write_text(
                json.dumps([a.model_dump() for a in answers], indent=2),
                encoding="utf-8",
            )
            return True

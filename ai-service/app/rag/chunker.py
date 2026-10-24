from typing import List

class TextChunker:
    """
    Safely segments knowledge documents into manageable token/character windows
    with overlap to preserve contextual continuity during retrieval.
    """
    def __init__(self, chunk_size: int = 400, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk_text(self, text: str) -> List[str]:
        if not text or not text.strip():
            return []

        text = text.strip()
        words = text.split()
        if len(words) <= self.chunk_size:
            return [text]

        chunks = []
        i = 0
        while i < len(words):
            chunk = " ".join(words[i : i + self.chunk_size])
            chunks.append(chunk)
            i += self.chunk_size - self.chunk_overlap

        return chunks

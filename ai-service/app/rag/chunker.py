import re
from typing import List

class TextChunker:
    """
    Safely segments knowledge documents into manageable token/character windows
    with overlap to preserve contextual continuity during retrieval.
    Preserves page boundaries when explicit page markers are present.
    """
    def __init__(self, chunk_size: int = 400, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk_text(self, text: str) -> List[str]:
        if not text or not text.strip():
            return []

        text = text.strip()

        # If document has explicit page delimiters, chunk page-by-page to preserve citation boundaries
        if re.search(r"\[Page\s+\d+\]", text):
            page_blocks = re.split(r"(?=\[Page\s+\d+\])", text)
            chunks = []
            for block in page_blocks:
                b = block.strip()
                if not b:
                    continue
                words = b.split()
                if len(words) <= self.chunk_size:
                    chunks.append(b)
                else:
                    i = 0
                    while i < len(words):
                        chunk = " ".join(words[i : i + self.chunk_size])
                        chunks.append(chunk)
                        i += self.chunk_size - self.chunk_overlap
            return chunks

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
